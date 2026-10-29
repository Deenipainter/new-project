import "server-only";

import { alrahuzConfig, alrahuzHealth } from "@/lib/config";
import { fetchWithTimeout, readJsonSafe, redact } from "@/lib/http";
import {
  nairaToKoboValue,
  normalizeStatus,
  parseSizeMb,
  pick,
  type NormalizedStatus,
} from "@/lib/providers/normalize";

export type { NormalizedStatus };
export { normalizeStatus, parseSizeMb };

export type ProviderPlan = {
  planCode: string;
  name: string;
  network: string;
  dataType: string;
  sizeMb: number;
  validity: string;
  priceKobo: number;
  costKobo: number | null;
};

export type PurchaseResult = {
  status: NormalizedStatus;
  providerReference: string | null;
  message: string;
  rawStatus: string | null;
};

export class ProviderNotConfiguredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(
      "Alrahuz Data is not configured. Live vending stays disabled until the API base URL, key and verified endpoint contract are supplied.",
    );
    this.name = "ProviderNotConfiguredError";
    this.missing = missing;
  }
}

export class ProviderRequestError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

function assertConfigured() {
  const health = alrahuzHealth();
  if (!health.configured) throw new ProviderNotConfiguredError(health.missing);
  return alrahuzConfig();
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const cfg = assertConfigured();
  const url = new URL(`${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);

  const response = await fetchWithTimeout(url.toString(), {
    ...init,
    timeoutMs: cfg.timeoutMs,
    headers: {
      Accept: "application/json",
      Authorization: `${cfg.authScheme} ${cfg.apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const payload = await readJsonSafe(response);
  if (!response.ok) {
    const text =
      typeof payload === "object" && payload !== null
        ? JSON.stringify(payload).slice(0, 300)
        : String(payload ?? "");
    throw new ProviderRequestError(
      redact(`Alrahuz returned HTTP ${response.status} ${text}`, [cfg.apiKey]),
      response.status,
    );
  }
  return payload;
}


function planRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  const nested = pick(payload, ["data", "plans", "results", "result"]);
  if (Array.isArray(nested)) return nested as Array<Record<string, unknown>>;
  return [];
}

export type RawPlanPayload = {
  networkHint?: string;
  dataTypeHint?: string;
};

/**
 * Fetches the provider plan catalogue. The response shape is provider-defined
 * and has not been confirmed in this project, so parsing is defensive and rows
 * missing a plan id or a price are skipped rather than guessed.
 */
export async function fetchProviderPlans(hints: RawPlanPayload = {}): Promise<ProviderPlan[]> {
  const cfg = assertConfigured();
  const payload = await request(cfg.paths.dataPlans, { method: "GET" });
  const rows = planRows(payload);
  const plans: ProviderPlan[] = [];

  for (const row of rows) {
    const planCode = String(pick(row, ["plan_id", "planId", "id", "plan", "code"]) ?? "").trim();
    const name = String(pick(row, ["plan", "name", "plan_name", "title", "size"]) ?? "").trim();
    const priceKobo = nairaToKoboValue(pick(row, ["price", "amount", "plan_amount", "selling_price"]));
    if (!planCode || !priceKobo) continue;

    const sizeSource = String(pick(row, ["size", "volume", "data_size", "plan"]) ?? name);
    const sizeMb = parseSizeMb(sizeSource);
    plans.push({
      planCode,
      name: name || sizeSource,
      network: String(pick(row, ["network", "network_name"]) ?? hints.networkHint ?? "MTN").toUpperCase(),
      dataType: String(pick(row, ["type", "plan_type", "data_type", "category"]) ?? hints.dataTypeHint ?? "SME").toUpperCase(),
      sizeMb,
      validity: String(pick(row, ["validity", "duration", "day", "days"]) ?? "").trim(),
      priceKobo,
      costKobo: nairaToKoboValue(pick(row, ["cost", "cost_price", "reseller_price"])) || null,
    });
  }
  return plans;
}

export async function checkProviderBalance(): Promise<{ balanceKobo: number | null; message: string }> {
  const cfg = assertConfigured();
  const payload = await request(cfg.paths.balance, { method: "GET" });
  const raw = pick(payload, ["balance", "wallet", "account_balance", "data"]);
  const value = typeof raw === "object" && raw !== null ? pick(raw, ["balance", "amount"]) : raw;
  const naira = Number(value);
  return {
    balanceKobo: Number.isFinite(naira) ? Math.round(naira * 100) : null,
    message: Number.isFinite(naira)
      ? "Provider balance retrieved."
      : "Provider responded but no numeric balance field was recognised.",
  };
}

/**
 * Places a data order. Called only once per internal order — there is no
 * automatic retry here. If this throws after the request left the server, the
 * order must be reconciled by reference before any retry or refund.
 */
export async function purchaseData(input: {
  network: string;
  dataType: string;
  planCode: string;
  phone: string;
  customerReference: string;
}): Promise<PurchaseResult> {
  const cfg = assertConfigured();
  const payload = await request(cfg.paths.purchaseData, {
    method: "POST",
    body: JSON.stringify({
      network: input.network,
      plan: input.planCode,
      mobile_number: input.phone,
      customer_ref: input.customerReference,
    }),
  });

  const statusRaw = pick(payload, ["status", "transaction_status", "state", "message"]);
  const providerReference = pick(payload, [
    "reference",
    "transaction_reference",
    "transactionId",
    "id",
    "order_id",
  ]);
  const message = String(pick(payload, ["message", "msg", "description", "detail"]) ?? "").trim();

  return {
    status: normalizeStatus(statusRaw),
    providerReference: providerReference ? String(providerReference) : null,
    message: message || "No message returned by provider.",
    rawStatus: statusRaw ? String(statusRaw) : null,
  };
}

export async function requeryTransaction(reference: string): Promise<PurchaseResult> {
  const cfg = assertConfigured();
  const url = `${cfg.paths.requery}${cfg.paths.requery.includes("?") ? "&" : "?"}reference=${encodeURIComponent(reference)}`;
  const payload = await request(url, { method: "GET" });
  const statusRaw = pick(payload, ["status", "transaction_status", "state"]);
  return {
    status: normalizeStatus(statusRaw),
    providerReference: String(
      pick(payload, ["reference", "transaction_reference", "transactionId", "id"]) ?? reference,
    ),
    message: String(pick(payload, ["message", "msg", "description"]) ?? "").trim(),
    rawStatus: statusRaw ? String(statusRaw) : null,
  };
}
