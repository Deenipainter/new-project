import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { fetchWithTimeout, readJsonSafe } from "@/lib/http";
import {
  isPaystackConfigured,
  paystackLiveBlocked,
  resolvePaystackConfig,
  type ResolvedPaystackConfig,
} from "@/lib/payment-gateway";

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super(
      "Paystack is not configured. Add your Paystack keys in Admin → Payment gateway settings to enable wallet funding.",
    );
    this.name = "PaystackNotConfiguredError";
  }
}

/**
 * Credentials come from the admin dashboard when they have been saved there,
 * otherwise from the server environment. Live keys stay inert until an
 * administrator enables live mode.
 */
async function activeConfig(): Promise<ResolvedPaystackConfig> {
  const cfg = await resolvePaystackConfig();
  if (!isPaystackConfigured(cfg)) throw new PaystackNotConfiguredError();
  if (paystackLiveBlocked(cfg)) {
    throw new Error(
      "A live Paystack key is installed but live charging is not enabled. Use test mode, or enable live mode deliberately in Payment gateway settings.",
    );
  }
  return cfg;
}

type InitResult = { authorizationUrl: string; accessCode: string; reference: string };

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
}): Promise<InitResult> {
  const cfg = await activeConfig();

  const body: Record<string, unknown> = {
    email: input.email,
    amount: input.amountKobo,
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata ?? {},
  };
  // Only restrict channels when the caller asked for a specific method. An empty
  // or missing list is omitted so Checkout shows whatever the account enabled.
  if (input.channels && input.channels.length > 0) body.channels = input.channels;

  const response = await fetchWithTimeout(`${cfg.baseUrl}/transaction/initialize`, {
    method: "POST",
    timeoutMs: cfg.timeoutMs,
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
  const cfg = await activeConfig();

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

/**
 * Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key
 * (or the dedicated webhook secret when one is configured). Async because the
 * secret may come from the encrypted admin configuration.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const cfg = await resolvePaystackConfig();
  if (!cfg.webhookSecret) return false;
  const expected = createHmac("sha512", cfg.webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
