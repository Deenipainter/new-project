import { headers } from "next/headers";

import { badRequest, ok, readBody, serverError, tooManyRequests, unavailable, unauthorized } from "@/lib/api";
import { clientIpFrom, getCurrentUser, rateLimit } from "@/lib/auth";
import { isPaystackReady, paystackHealth } from "@/lib/config";
import { prisma } from "@/lib/db";
import { MAX_FUNDING_KOBO, MIN_FUNDING_KOBO, formatNaira, newReference } from "@/lib/money";
import { initializeTransaction } from "@/lib/providers/paystack";

type Body = { amountKobo?: number; amountNaira?: number };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`fund:${user.id}`, 8, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  const amountKobo = Math.round(
    Number(body?.amountKobo ?? (body?.amountNaira ? body.amountNaira * 100 : 0)),
  );

  if (!Number.isFinite(amountKobo) || amountKobo < MIN_FUNDING_KOBO) {
    return badRequest(`Minimum funding amount is ${formatNaira(MIN_FUNDING_KOBO)}.`);
  }
  if (amountKobo > MAX_FUNDING_KOBO) {
    return badRequest(`Maximum funding amount per attempt is ${formatNaira(MAX_FUNDING_KOBO)}.`);
  }

  if (!isPaystackReady()) {
    return unavailable(
      "Wallet funding is not live yet. Add your Paystack keys and webhook secret to enable it.",
      "PAYMENTS_NOT_CONFIGURED",
      { missing: paystackHealth().missing },
    );
  }

  try {
    const reference = newReference("DPF");
    const attempt = await prisma.paymentAttempt.create({
      data: {
        userId: user.id,
        reference,
        amountKobo,
        provider: "paystack",
        status: "PENDING",
      },
    });

    const origin =
      request.headers.get("origin") ||
      (process.env.NEXT_PUBLIC_APP_URL ?? "").trim() ||
      `https://${headerList.get("host") ?? "localhost:3000"}`;

    const initialized = await initializeTransaction({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl: `${origin}/wallet/fund/callback?reference=${encodeURIComponent(reference)}`,
      metadata: { userId: user.id, paymentAttemptId: attempt.id },
    });

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { authorizationUrl: initialized.authorizationUrl, providerReference: initialized.reference },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        action: "wallet.funding_initialized",
        entity: "PaymentAttempt",
        entityId: attempt.id,
        ip,
        metadata: { amountKobo, reference },
      },
    });

    return ok({ authorizationUrl: initialized.authorizationUrl, reference });
  } catch (error) {
    console.error("[wallet/fund]", error instanceof Error ? error.message : error);
    return serverError("We could not start that payment. Your wallet was not charged.");
  }
}
