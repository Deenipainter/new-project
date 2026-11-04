import "server-only";

import { paystackHealthView } from "@/lib/config";
import { prisma } from "@/lib/db";
import { fetchWithTimeout, readJsonSafe } from "@/lib/http";
import { decryptSecret, encryptSecret, vaultStatus } from "@/lib/secret-vault";

/**
 * Paystack credentials for wallet funding.
 *
 * Resolution order: credentials saved by an administrator (encrypted in
 * PostgreSQL) win, then the server-side environment variables that existed
 * before this page did. Nothing here ever returns a secret to the browser —
 * callers only receive booleans, key families and validation messages.
 */
const ROW_ID = "paystack";
const DEFAULT_BASE_URL = "https://api.paystack.co";
const SECRET_KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9]{10,}$/;
const PUBLIC_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9]{10,}$/;
const WEBHOOK_SECRET_PATTERN = /^\S{8,200}$/;

export type GatewayMode = "TEST" | "LIVE";
export type KeyKind = "test" | "live";
export type CredentialSource = "saved" | "environment" | "none";

export type ResolvedPaystackConfig = {
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  baseUrl: string;
  timeoutMs: number;
  mode: GatewayMode;
  source: CredentialSource;
  liveApproved: boolean;
  /** True when a webhook secret is configured on its own instead of inferred from the secret key. */
  webhookSecretExplicit: boolean;
  stored: { secretKey: boolean; publicKey: boolean; webhookSecret: boolean };
  /** Ciphertext exists but this runtime's key material cannot decrypt it. */
  unreadable: boolean;
};

export function keyKind(value: string | null | undefined): KeyKind | null {
  if (!value) return null;
  if (value.startsWith("sk_test_") || value.startsWith("pk_test_")) return "test";
  if (value.startsWith("sk_live_") || value.startsWith("pk_live_")) return "live";
  return null;
}

function envSecretKey(): string {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || "";
}

function envPublicKey(): string {
  return process.env.PAYSTACK_PUBLIC_KEY?.trim() || "";
}

function envWebhookSecret(): string {
  return process.env.PAYSTACK_WEBHOOK_SECRET?.trim() || "";
}

function baseUrl(): string {
  return (process.env.PAYSTACK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function timeoutMs(): number {
  const value = Number(process.env.PAYSTACK_TIMEOUT_MS || 20000);
  return Number.isFinite(value) && value > 0 ? value : 20000;
}

let readFailureLogged = false;

/**
 * Reads the settings row. A missing table or an unavailable database degrades to
 * the environment variables so wallet funding behaves exactly as before this
 * feature existed.
 */
async function readRow() {
  try {
    return await prisma.paymentGatewaySettings.findUnique({ where: { id: ROW_ID } });
  } catch (error) {
    if (!readFailureLogged) {
      readFailureLogged = true;
      console.error(
        "[payment-gateway] settings unreadable, falling back to environment credentials",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

export async function resolvePaystackConfig(): Promise<ResolvedPaystackConfig> {
  const row = await readRow();

  const savedSecret = decryptSecret(row?.secretKeyCipher);
  const savedPublic = decryptSecret(row?.publicKeyCipher);
  const savedWebhook = decryptSecret(row?.webhookSecretCipher);

  const secretKey = savedSecret || envSecretKey();
  const publicKey = savedPublic || envPublicKey();
  const explicitWebhook = savedWebhook || envWebhookSecret();
  // Test-only deployment: even a legacy row that says LIVE resolves as TEST, so
  // wallet funding can never treat a live key as approved.
  const mode: GatewayMode = "TEST";

  return {
    secretKey,
    publicKey,
    webhookSecret: explicitWebhook || secretKey,
    baseUrl: baseUrl(),
    timeoutMs: timeoutMs(),
    mode,
    source: savedSecret ? "saved" : secretKey ? "environment" : "none",
    liveApproved: Boolean(row?.liveApprovedAt),
    webhookSecretExplicit: Boolean(explicitWebhook),
    stored: {
      secretKey: Boolean(row?.secretKeyCipher),
      publicKey: Boolean(row?.publicKeyCipher),
      webhookSecret: Boolean(row?.webhookSecretCipher),
    },
    unreadable:
      (Boolean(row?.secretKeyCipher) && !savedSecret) ||
      (Boolean(row?.publicKeyCipher) && !savedPublic) ||
      (Boolean(row?.webhookSecretCipher) && !savedWebhook),
  };
}

export function isPaystackConfigured(cfg: Pick<ResolvedPaystackConfig, "secretKey">): boolean {
  const key = cfg.secretKey.trim();
  return Boolean(key) && !key.startsWith("YOUR_") && key.length >= 20;
}

/**
 * Live keys are refused unless live mode was enabled here by an administrator
 * (mode LIVE + recorded approval) or PAYSTACK_ALLOW_LIVE=true was set
 * deliberately in the server environment.
 */
export function paystackLiveBlocked(cfg: ResolvedPaystackConfig): boolean {
  if (!cfg.secretKey.startsWith("sk_live_")) return false;
  if (cfg.source === "saved" && cfg.mode === "LIVE" && cfg.liveApproved) return false;
  return process.env.PAYSTACK_ALLOW_LIVE !== "true";
}

/** Provider health computed from the *effective* (saved or environment) credentials. */
export function paystackProviderHealth(cfg: ResolvedPaystackConfig) {
  return paystackHealthView({
    secretKey: cfg.secretKey,
    publicKey: cfg.publicKey,
    webhookSecretExplicit: cfg.webhookSecretExplicit,
    testMode: cfg.mode === "TEST",
  });
}

/** Convenience for read-only views that only need a boolean. */
export async function isPaystackFundingReady(): Promise<boolean> {
  try {
    const cfg = await resolvePaystackConfig();
    return isPaystackConfigured(cfg) && !paystackLiveBlocked(cfg);
  } catch {
    return false;
  }
}

export type PaymentGatewayStatus = {
  provider: "paystack";
  mode: GatewayMode;
  ready: boolean;
  liveBlocked: boolean;
  liveApproved: boolean;
  liveApprovedAt: string | null;
  source: CredentialSource;
  secretKey: { configured: boolean; stored: boolean; kind: KeyKind | null };
  publicKey: { configured: boolean; stored: boolean; kind: KeyKind | null };
  webhookSecret: {
    configured: boolean;
    stored: boolean;
    source: "saved" | "environment" | "secret-key";
  };
  missing: string[];
  baseUrl: string;
  unreadable: boolean;
  lastValidatedAt: string | null;
  lastValidatedOk: boolean | null;
  lastValidationMessage: string | null;
  encryption: { ready: boolean; algorithm: string; keySource: string; detail: string };
  updatedAt: string | null;
  configuredAt: string | null;
};

/**
 * The only shape the browser ever receives. It contains no secret value,
 * no ciphertext and no partial key.
 */
export async function loadPaymentGatewayStatus(): Promise<PaymentGatewayStatus> {
  const [row, cfg] = await Promise.all([readRow(), resolvePaystackConfig()]);
  const health = paystackProviderHealth(cfg);
  const usableSecret = isPaystackConfigured(cfg);
  const usablePublic = Boolean(cfg.publicKey) && !cfg.publicKey.startsWith("YOUR_");
  const usableWebhook =
    cfg.webhookSecretExplicit && !cfg.webhookSecret.startsWith("YOUR_") && cfg.webhookSecret.length >= 8;

  return {
    provider: "paystack",
    mode: cfg.mode,
    ready: usableSecret && !paystackLiveBlocked(cfg),
    liveBlocked: paystackLiveBlocked(cfg),
    liveApproved: cfg.liveApproved,
    liveApprovedAt: row?.liveApprovedAt ? row.liveApprovedAt.toISOString() : null,
    source: cfg.source,
    secretKey: {
      configured: usableSecret,
      stored: cfg.stored.secretKey,
      kind: keyKind(cfg.secretKey),
    },
    publicKey: {
      configured: usablePublic,
      stored: cfg.stored.publicKey,
      kind: keyKind(cfg.publicKey),
    },
    webhookSecret: {
      configured: usableWebhook || usableSecret,
      stored: cfg.stored.webhookSecret,
      source: cfg.stored.webhookSecret
        ? "saved"
        : envWebhookSecret()
          ? "environment"
          : "secret-key",
    },
    missing: health.missing,
    baseUrl: cfg.baseUrl,
    unreadable: cfg.unreadable,
    lastValidatedAt: row?.lastValidatedAt ? row.lastValidatedAt.toISOString() : null,
    lastValidatedOk: row?.lastValidatedOk ?? null,
    lastValidationMessage: row?.lastValidationMessage ?? null,
    encryption: vaultStatus(),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    configuredAt: row?.createdAt ? row.createdAt.toISOString() : null,
  };
}

export type GatewayValidationResult = {
  ok: boolean;
  message: string;
  checkedAt: string;
  mode: GatewayMode;
  currencies: string[];
};

/**
 * Read-only check: calls Paystack's balance endpoint with the resolved secret
 * key. It cannot move money and it never echoes the key back.
 */
export async function validateSavedPaystackConnection(
  actor: { id: string; email: string },
  ip: string | null,
): Promise<GatewayValidationResult> {
  const cfg = await resolvePaystackConfig();
  const checkedAt = new Date();
  let result: { ok: boolean; message: string; currencies: string[] };

  if (!isPaystackConfigured(cfg)) {
    result = {
      ok: false,
      message: "No Paystack secret key is configured yet. Save a key, then run the check again.",
      currencies: [],
    };
  } else if (paystackLiveBlocked(cfg)) {
    result = {
      ok: false,
      message:
        "A live secret key is installed but live charging is not enabled. Switch to test mode with a test key, or enable live mode deliberately.",
      currencies: [],
    };
  } else {
    try {
      const response = await fetchWithTimeout(`${cfg.baseUrl}/balance`, {
        method: "GET",
        timeoutMs: Math.min(cfg.timeoutMs, 15000),
        headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" },
      });
      const payload = (await readJsonSafe(response)) as {
        status?: boolean;
        message?: string;
        data?: Array<{ currency?: string; balance?: number }>;
      } | null;

      if (response.status === 401 || response.status === 403) {
        result = {
          ok: false,
          message:
            "Paystack rejected that key (HTTP 401/403). Check that it is copied in full and belongs to the mode you selected.",
          currencies: [],
        };
      } else if (!response.ok || !payload?.status) {
        result = {
          ok: false,
          message: payload?.message || `Paystack returned HTTP ${response.status}. The key was not confirmed.`,
          currencies: [],
        };
      } else {
        const currencies = Array.isArray(payload.data)
          ? payload.data.map((entry) => String(entry?.currency || "").trim()).filter(Boolean)
          : [];
        result = {
          ok: true,
          message:
            `Paystack accepted the ${cfg.mode === "TEST" ? "test" : "live"} credentials.` +
            (currencies.length > 0 ? ` Balances are readable for ${currencies.join(", ")}.` : ""),
          currencies,
        };
      }
    } catch (error) {
      result = {
        ok: false,
        message:
          "Could not reach Paystack to confirm the key. Check the server's network access and try again." +
          (error instanceof Error ? ` (${error.name})` : ""),
        currencies: [],
      };
    }
  }

  const message = result.message.slice(0, 240);
  await prisma.paymentGatewaySettings
    .upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, lastValidatedAt: checkedAt, lastValidatedOk: result.ok, lastValidationMessage: message },
      update: { lastValidatedAt: checkedAt, lastValidatedOk: result.ok, lastValidationMessage: message },
    })
    .catch(() => undefined);

  await prisma.auditEvent
    .create({
      data: {
        actorId: actor.id,
        actorRole: "ADMIN",
        action: "payment.gateway_validated",
        entity: "PaymentGatewaySettings",
        entityId: ROW_ID,
        ip,
        metadata: { ok: result.ok, mode: cfg.mode, source: cfg.source },
      },
    })
    .catch(() => undefined);

  return {
    ok: result.ok,
    message,
    checkedAt: checkedAt.toISOString(),
    mode: cfg.mode,
    currencies: result.currencies,
  };
}

export type SavePaystackInput = {
  secretKey?: string;
  publicKey?: string;
  webhookSecret?: string;
  mode?: string;
  /** Must be true to turn live mode on. Never implied by saving a live key. */
  enableLive?: boolean;
  /** Run the read-only Paystack check straight after saving. */
  verify?: boolean;
};

export type SavePaystackResult =
  | {
      ok: true;
      message: string;
      status: PaymentGatewayStatus;
      validation: GatewayValidationResult | null;
    }
  | { ok: false; error: string; field?: "secretKey" | "publicKey" | "webhookSecret" | "mode" };

/**
 * Validates on the server, encrypts, and stores. Empty inputs keep the existing
 * credential so a saved secret is never echoed back and forth through the form.
 */
export async function savePaystackSettings(
  input: SavePaystackInput,
  actor: { id: string; email: string },
  ip: string | null,
): Promise<SavePaystackResult> {
  if (!vaultStatus().ready) {
    return {
      ok: false,
      error:
        "Credentials cannot be encrypted because no server-side key material is available. Set PAYMENT_SETTINGS_ENCRYPTION_KEY in the server environment first.",
    };
  }

  const row = await readRow();
  const currentSecret = decryptSecret(row?.secretKeyCipher);
  const currentPublic = decryptSecret(row?.publicKeyCipher);
  const currentWebhook = decryptSecret(row?.webhookSecretCipher);

  const nextSecretInput = (input.secretKey ?? "").trim();
  const nextPublicInput = (input.publicKey ?? "").trim();
  const nextWebhookInput = (input.webhookSecret ?? "").trim();
  // This deployment is deliberately test-only. The mode is forced here rather
  // than trusted from the request body, so no UI state or crafted POST can put
  // real customer cards into play.
  const mode: GatewayMode = "TEST";

  if (nextSecretInput && !SECRET_KEY_PATTERN.test(nextSecretInput)) {
    return {
      ok: false,
      field: "secretKey",
      error:
        "That does not look like a Paystack secret key. Test keys start with sk_test_ and live keys start with sk_live_, followed by at least 10 characters.",
    };
  }
  if (nextPublicInput && !PUBLIC_KEY_PATTERN.test(nextPublicInput)) {
    return {
      ok: false,
      field: "publicKey",
      error: "That does not look like a Paystack public key. It should start with pk_test_ or pk_live_.",
    };
  }
  if (nextWebhookInput && !WEBHOOK_SECRET_PATTERN.test(nextWebhookInput)) {
    return {
      ok: false,
      field: "webhookSecret",
      error: "The webhook secret must be 8–200 characters with no spaces.",
    };
  }

  const effectiveSecret = nextSecretInput || currentSecret || envSecretKey();
  const effectivePublic = nextPublicInput || currentPublic || envPublicKey();
  const secretKind = keyKind(effectiveSecret);
  const publicKind = keyKind(effectivePublic);

  // Test-only policy: a live key can never be stored, whichever mode the caller
  // asks for. This is enforced from the key itself, not from the form state, and
  // is checked before the key-family comparison so the message is never vague.
  if (secretKind === "live" || publicKind === "live") {
    return {
      ok: false,
      field: secretKind === "live" ? "secretKey" : "publicKey",
      error:
        "Live keys are refused. This application is locked to Paystack test mode, so only keys starting with sk_test_ and pk_test_ can be stored.",
    };
  }

  if (secretKind && publicKind && secretKind !== publicKind) {
    return {
      ok: false,
      field: "publicKey",
      error: "That public key does not match the saved secret key. Both must be test keys.",
    };
  }

  let secretKeyCipher = row?.secretKeyCipher ?? null;
  let publicKeyCipher = row?.publicKeyCipher ?? null;
  let webhookSecretCipher = row?.webhookSecretCipher ?? null;

  try {
    if (nextSecretInput) secretKeyCipher = encryptSecret(nextSecretInput);
    if (nextPublicInput) publicKeyCipher = encryptSecret(nextPublicInput);
    if (nextWebhookInput) webhookSecretCipher = encryptSecret(nextWebhookInput);
  } catch {
    return { ok: false, error: "The credentials could not be encrypted, so nothing was saved." };
  }

  const data = {
    provider: "paystack",
    secretKeyCipher,
    publicKeyCipher,
    webhookSecretCipher,
    secretKeyKind: secretKind,
    publicKeyKind: publicKind,
    mode,
    // Test-only deployment: live approval can never be recorded from this page.
    liveApprovedAt: null,
    liveApprovedById: null,
    updatedById: actor.id,
  };

  await prisma.paymentGatewaySettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...data },
    update: data,
  });

  await prisma.auditEvent
    .create({
      data: {
        actorId: actor.id,
        actorRole: "ADMIN",
        action: "payment.gateway_settings_saved",
        entity: "PaymentGatewaySettings",
        entityId: ROW_ID,
        ip,
        // Non-secret metadata only: never the key, the ciphertext or a fragment.
        metadata: {
          mode,
          liveApproved: false,
          secretKeyUpdated: Boolean(nextSecretInput),
          publicKeyUpdated: Boolean(nextPublicInput),
          webhookSecretUpdated: Boolean(nextWebhookInput),
          secretKeyKind: secretKind,
        },
      },
    })
    .catch(() => undefined);

  const validation = input.verify ? await validateSavedPaystackConnection(actor, ip) : null;
  const changed = [
    nextSecretInput ? "secret key" : null,
    nextPublicInput ? "public key" : null,
    nextWebhookInput ? "webhook secret" : null,
  ].filter(Boolean);

  return {
    ok: true,
    message:
      (changed.length > 0
        ? `Configuration saved and encrypted. Updated: ${changed.join(", ")}.`
        : "Configuration saved. No credential was changed.") +
      " Test mode is active.",
    status: await loadPaymentGatewayStatus(),
    validation,
  };
}

/** Removes every stored credential and returns to test mode. */
export async function clearPaystackSettings(
  actor: { id: string; email: string },
  ip: string | null,
): Promise<PaymentGatewayStatus> {
  await prisma.paymentGatewaySettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, mode: "TEST", updatedById: actor.id },
    update: {
      secretKeyCipher: null,
      publicKeyCipher: null,
      webhookSecretCipher: null,
      secretKeyKind: null,
      publicKeyKind: null,
      mode: "TEST",
      liveApprovedAt: null,
      liveApprovedById: null,
      lastValidatedAt: null,
      lastValidatedOk: null,
      lastValidationMessage: null,
      updatedById: actor.id,
    },
  });

  await prisma.auditEvent
    .create({
      data: {
        actorId: actor.id,
        actorRole: "ADMIN",
        action: "payment.gateway_settings_cleared",
        entity: "PaymentGatewaySettings",
        entityId: ROW_ID,
        ip,
        metadata: { mode: "TEST" },
      },
    })
    .catch(() => undefined);

  return loadPaymentGatewayStatus();
}
