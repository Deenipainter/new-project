import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { paystackConfig, isPaystackReady } from "@/lib/config";
import { fetchWithTimeout, readJsonSafe } from "@/lib/http";

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super(
      "Paystack is not configured. Add PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY to enable wallet funding.",
    );
    this.name = "PaystackNotConfiguredError";
  }
}

type InitResult = { authorizationUrl: string; accessCode: string; reference: string };

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitResult> {
  if (!isPaystackReady()) throw new PaystackNotConfiguredError();
  const cfg = paystackConfig();

  const response = await fetchWithTimeout(`${cfg.baseUrl}/transaction/initialize`, {
    method: "POST",
    timeoutMs: cfg.timeoutMs,
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
  });

  const payload = (await readJsonSafe(response)) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  } | null;

  if (!response.ok || !payload?.status || !payload.data?.authorization_url) {
    throw new Error(payload?.message || `Paystack rejected the payment request (HTTP ${response.status}).`);
  }

  return {
    authorizationUrl: payload.data.authorization_url,
    accessCode: payload.data.access_code ?? "",
    reference: payload.data.reference ?? input.reference,
  };
}

export type VerifyResult = {
  paid: boolean;
  status: string;
  amountKobo: number;
  currency: string;
  reference: string;
  channel: string | null;
  message: string;
};

/** Server-side verification. A redirect is never treated as proof of payment. */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  if (!isPaystackReady()) throw new PaystackNotConfiguredError();
  const cfg = paystackConfig();

  const response = await fetchWithTimeout(
    `${cfg.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      timeoutMs: cfg.timeoutMs,
      headers: { Authorization: `Bearer ${cfg.secretKey}` },
    },
  );

  const payload = (await readJsonSafe(response)) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      reference?: string;
      channel?: string;
      gateway_response?: string;
    };
  } | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.message || `Paystack verification failed (HTTP ${response.status}).`);
  }

  const data = payload.data;
  return {
    paid: data.status === "success",
    status: data.status ?? "unknown",
    amountKobo: Number(data.amount ?? 0),
    currency: data.currency ?? "NGN",
    reference: data.reference ?? reference,
    channel: data.channel ?? null,
    message: data.gateway_response ?? payload.message ?? "",
  };
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const cfg = paystackConfig();
  if (!cfg.webhookSecret) return false;
  const expected = createHmac("sha512", cfg.webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
