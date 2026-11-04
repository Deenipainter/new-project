import { headers } from "next/headers";

import {
  badRequest,
  ok,
  readBody,
  serverError,
  tooManyRequests,
  unavailable,
  unauthorized,
} from "@/lib/api";
import { clientIpFrom, getCurrentUser, rateLimit } from "@/lib/auth";
import { paystackChannelConfig } from "@/lib/config";
import {
  isPaystackConfigured,
  paystackLiveBlocked,
  paystackProviderHealth,
  resolvePaystackConfig,
} from "@/lib/payment-gateway";
import { prisma } from "@/lib/db";
import { MAX_FUNDING_KOBO, MIN_FUNDING_KOBO, formatNaira, newReference } from "@/lib/money";
import {
  getPaymentMethod,
  isPaymentMethodId,
  resolvePaymentMethods,
  type PaymentMethodId,
} from "@/lib/payment-methods";
import { initializeTransaction } from "@/lib/providers/paystack";

type Body = { amountKobo?: number; amountNaira?: number; paymentMethod?: string };

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

  if (body?.paymentMethod !== undefined && !isPaymentMethodId(body.paymentMethod)) {
    return badRequest("That payment method is not supported.");
  }
  const method: PaymentMethodId = isPaymentMethodId(body?.paymentMethod) ? body.paymentMethod : "any";

  const paystack = await resolvePaystackConfig();

  if (!isPaystackConfigured(paystack)) {
    return unavailable(
      "Wallet funding is not live yet. Add your Paystack keys and webhook secret in Admin → Payment gateway settings.",
      "PAYMENTS_NOT_CONFIGURED",
      { missing: paystackProviderHealth(paystack).missing },
    );
  }

  if (paystackLiveBlocked(paystack)) {
    return unavailable(
      "Live Paystack keys are installed but live charging is disabled until an administrator enables live mode. Use test keys, or enable live mode deliberately in Payment gateway settings.",
      "PAYSTACK_LIVE_MODE_BLOCKED",
    );
  }

  // The browser only sends a method id. The channel list is resolved here.
  const channelCfg = paystackChannelConfig();
  const option = resolvePaymentMethods({
    paymentsReady: true,
    declaredChannels: channelCfg.declaredChannels,
    palmPayEnabled: channelCfg.palmPayEnabled,
  }).find((candidate) => candidate.id === method);

  if (!option || !option.available) {
    return unavailable(
      option?.unavailableReason ?? "That payment method is not available on this account.",
      "PAYMENT_METHOD_UNAVAILABLE",
    );
  }

  const channels = getPaymentMethod(method).channels;

  let attemptId: string | null = null;
  try {
    const reference = newReference("DPF");
    const attempt = await prisma.paymentAttempt.create({
      data: {
        userId: user.id,
        reference,
        amountKobo,
        provider: "paystack",
        status: "PENDING",
        requestedMethod: method === "any" ? null : method,
      },
    });
    attemptId = attempt.id;

    const origin =
      request.headers.get("origin") ||
      (process.env.NEXT_PUBLIC_APP_URL ?? "").trim() ||
      `https://${headerList.get("host") ?? "localhost:3000"}`;

    const initialized = await initializeTransaction({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl: `${origin}/wallet/fund/callback?reference=${encodeURIComponent(reference)}`,
      channels,
      metadata: {
        userId: user.id,
        paymentAttemptId: attempt.id,
        requestedMethod: method,
      },
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
        metadata: { amountKobo, reference, method, channels },
      },
    });

    return ok({
      authorizationUrl: initialized.authorizationUrl,
      reference,
      method,
      testMode: paystack.mode === "TEST",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[wallet/fund]", message);

    if (attemptId) {
      await prisma.paymentAttempt
        .update({
          where: { id: attemptId },
          data: { status: "FAILED", failureReason: `Initialisation failed: ${message}`.slice(0, 500) },
        })
        .catch(() => undefined);
    }

    const channelRejected = /channel/i.test(message);
    return unavailable(
      channelRejected
        ? `Paystack would not open that payment method for this account: ${message} Nothing was charged.`
        : "We could not start that payment. Your wallet was not charged.",
      channelRejected ? "PAYMENT_CHANNEL_REJECTED" : "PAYMENT_INIT_FAILED",
    );
  }
}
