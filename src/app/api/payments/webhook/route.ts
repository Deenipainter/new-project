import { NextResponse } from "next/server";

import { isPaystackConfigured, resolvePaystackConfig } from "@/lib/payment-gateway";
import { settlePaymentAttempt } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/providers/paystack";
import { prisma } from "@/lib/db";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    status?: string;
    currency?: string;
  };
};

/**
 * Paystack webhook. Signature is checked against the RAW body, then the
 * transaction is re-verified with Paystack before any wallet credit.
 * Duplicate deliveries are idempotent because settlement is guarded by the
 * attempt status and a unique ledger reference.
 */
export async function POST(request: Request) {
  const paystack = await resolvePaystackConfig();
  if (!isPaystackConfigured(paystack)) {
    return NextResponse.json({ status: "payments-not-configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const reference = event.data?.reference;
  if (!reference) return NextResponse.json({ status: "ignored" });

  try {
    const result = await settlePaymentAttempt({ reference, source: "webhook" });
    return NextResponse.json({ status: "processed", result: result.status });
  } catch (error) {
    // A 5xx makes Paystack retry, which is what we want for transient failures.
    console.error("[paystack-webhook]", error instanceof Error ? error.message : error);
    await prisma.auditEvent
      .create({
        data: {
          action: "payment.webhook_error",
          entity: "PaymentAttempt",
          actorRole: "SYSTEM",
          metadata: { reference, event: event.event ?? null },
        },
      })
      .catch(() => undefined);
    return NextResponse.json({ error: "processing-error" }, { status: 500 });
  }
}
