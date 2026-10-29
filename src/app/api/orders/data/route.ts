import { headers } from "next/headers";

import { badRequest, created, ok, readBody, serverError, tooManyRequests, unauthorized } from "@/lib/api";
import { clientIpFrom, getCurrentUser, rateLimit } from "@/lib/auth";
import { OrderError, placeDataOrder } from "@/lib/orders";
import { ProviderNotConfiguredError } from "@/lib/providers/alrahuz";
import { dataTypesFor, isKnownNetwork } from "@/lib/reference-plans";
import { normalizePhone } from "@/lib/validation";

type Body = {
  network?: string;
  dataType?: string;
  planCode?: string;
  phone?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`order:${user.id}`, 12, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  if (!body) return badRequest("Send the order as JSON.");

  const network = (body.network || "").toUpperCase();
  const dataType = (body.dataType || "").toUpperCase();
  const planCode = (body.planCode || "").trim();
  const phone = normalizePhone(body.phone || "");
  const idempotencyKey = (body.idempotencyKey || "").trim();

  if (!isKnownNetwork(network)) return badRequest("Choose a supported network.");
  if (!dataTypesFor(network).includes(dataType)) {
    return badRequest("That data type is not available for this network yet.");
  }
  if (!planCode) return badRequest("Choose a data plan.");
  if (!phone) return badRequest("Enter a valid Nigerian phone number for the recipient.");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 80) {
    return badRequest("A valid idempotency key is required.");
  }

  try {
    const { order, replayed } = await placeDataOrder({
      userId: user.id,
      network,
      dataType,
      planCode,
      phone,
      idempotencyKey,
    });
    const payload = {
      order: {
        id: order.id,
        reference: order.reference,
        status: order.status,
        planName: order.planName,
        amountKobo: order.amountKobo,
        recipient: order.recipient,
        providerMessage: order.providerMessage,
        createdAt: order.createdAt,
      },
      replayed,
    };
    return replayed ? ok(payload) : created(payload);
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return ok(
        {
          error: error.message,
          code: "PROVIDER_NOT_CONFIGURED",
          missing: error.missing,
        },
        { status: 503 },
      );
    }
    if (error instanceof OrderError) {
      return ok({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[orders/data]", error instanceof Error ? error.message : error);
    return serverError("We could not place that order. Nothing was deducted.");
  }
}
