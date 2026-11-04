import "server-only";

import type { ProviderHealth } from "@/lib/config";
import { prisma } from "@/lib/db";
import { fetchWithTimeout, readJsonSafe, redact } from "@/lib/http";
import { decryptSecret, encryptSecret, vaultStatus } from "@/lib/secret-vault";

/**
 * Alrahuz Data credentials managed from Admin -> Alrahuz API settings.
 *
 * Security model (identical to the Paystack settings):
 *   - the API key is encrypted with AES-256-GCM *before* it reaches PostgreSQL,
 *     using the server-only vault in `secret-vault.ts`;
 *   - the browser only ever receives booleans, a fixed mask and the non-secret
 *     connection result — never the key, a fragment of it, or its ciphertext;
 *   - nothing here logs the key, and provider errors are redacted before they
 *     are stored or returned.
 *
 * Resolution order: credentials saved by an administrator win, then the
 * existing ALRAHUZ_* environment variables. No provider URL, path or request
 * field is invented: the base URL and the read-only check path are supplied by
 * the administrator from the official Alrahuz documentation.
 */
const ROW_ID = "alrahuz";
const DEFAULT_AUTH_SCHEME = "Token";
/** Read-only account/wallet lookup already used by the rest of this project. */
const DEFAULT_CHECK_PATH = "/api/user/";
const AUTH_SCHEMES = ["Token", "Bearer"] as const;
const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 512;
const MASK = "••••••••••••";

export type AlrahuzAuthScheme = (typeof AUTH_SCHEMES)[number];
export type AlrahuzCredentialSource = "saved" | "environment" | "none";
export type AlrahuzConnectionState = "not-configured" | "untested" | "connected" | "failed";

export type ResolvedAlrahuzConfig = {
  apiKey: string;
  baseUrl: string;
  authScheme: AlrahuzAuthScheme;
  checkPath: string;
  /** Paths the existing provider module already used; unchanged defaults. */
  paths: { dataPlans: string; purchaseData: string; requery: string; balance: string };
  timeoutMs: number;
  source: AlrahuzCredentialSource;
  stored: { apiKey: boolean; baseUrl: boolean };
  /** Ciphertext exists but this runtime's key material cannot decrypt it. */
  unreadable: boolean;
  endpointsVerified: boolean;
};

export type AlrahuzSettingsStatus = {
  provider: "alrahuz";
  state: AlrahuzConnectionState;
  configured: boolean;
  apiKey: { configured: boolean; stored: boolean; masked: string | null };
  baseUrl: string | null;
  authScheme: AlrahuzAuthScheme;
  checkPath: string;
  checkUrl: string | null;
  source: AlrahuzCredentialSource;
  unreadable: boolean;
  endpointsVerified: boolean;
  missing: string[];
  lastValidatedAt: string | null;
  lastValidatedOk: boolean | null;
  lastValidationMessage: string | null;
  encryption: ReturnType<typeof vaultStatus>;
  updatedAt: string | null;
  createdAt: string | null;
};

export type AlrahuzValidationResult = {
  ok: boolean;
  state: "connected" | "failed" | "not-configured";
  message: string;
  checkedAt: string;
  /** Path that was probed, never including the API key. */
  path: string | null;
  httpStatus: number | null;
};

function envApiKey(): string {
  return process.env.ALRAHUZ_API_KEY?.trim() || "";
}

function envBaseUrl(): string {
  return (process.env.ALRAHUZ_API_BASE_URL || "").trim().replace(/\/+$/, "");
}

function envAuthScheme(): AlrahuzAuthScheme {
  const raw = (process.env.ALRAHUZ_AUTH_SCHEME || "").trim().toLowerCase();
  return raw === "bearer" ? "Bearer" : "Token";
}

function envCheckPath(): string {
  return (process.env.ALRAHUZ_BALANCE_PATH || "").trim();
}

function timeoutMs(): number {
  const value = Number(process.env.ALRAHUZ_TIMEOUT_MS || 15000);
  return Number.isFinite(value) && value > 0 ? value : 15000;
}

function endpointsVerified(): boolean {
  return process.env.ALRAHUZ_ENDPOINTS_VERIFIED === "true";
}

function isPlaceholder(value: string): boolean {
  return !value || value.startsWith("YOUR_");
}

let readFailureLogged = false;

/**
 * Reads the settings row. A missing table or an unreachable database degrades to
 * the environment variables, so existing behaviour is preserved.
 */
async function readRow() {
  try {
    return await prisma.alrahuzSettings.findUnique({ where: { id: ROW_ID } });
  } catch (error) {
    if (!readFailureLogged) {
      readFailureLogged = true;
      console.error(
        "[alrahuz-settings] settings unreadable, falling back to environment credentials",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

function normalizeAuthScheme(raw: string | null | undefined): AlrahuzAuthScheme {
  return (raw || "").trim().toLowerCase() === "bearer" ? "Bearer" : "Token";
}

/** Credentials for server-side use. Never returned by an API route. */
export async function resolveAlrahuzConfig(): Promise<ResolvedAlrahuzConfig> {
  const row = await readRow();
  const savedKey = decryptSecret(row?.apiKeyCipher);
  const envKey = envApiKey();

  const apiKey = savedKey || (isPlaceholder(envKey) ? "" : envKey);
  const baseUrl = (row?.baseUrl || envBaseUrl()).trim().replace(/\/+$/, "");
  const paths = {
    dataPlans: process.env.ALRAHUZ_DATA_PLANS_PATH || "/api/data/",
    purchaseData: process.env.ALRAHUZ_PURCHASE_DATA_PATH || "/api/data/",
    requery: process.env.ALRAHUZ_REQUERY_PATH || "/api/data/",
    balance: envCheckPath() || DEFAULT_CHECK_PATH,
  };
  const storedPath = (row?.checkPath || "").trim();
  const checkPath = storedPath || paths.balance;

  return {
    apiKey,
    baseUrl: isPlaceholder(baseUrl) ? "" : baseUrl,
    authScheme: normalizeAuthScheme(row?.authScheme || envAuthScheme()),
    checkPath,
    paths,
    timeoutMs: timeoutMs(),
    source: savedKey ? "saved" : apiKey ? "environment" : "none",
    stored: { apiKey: Boolean(row?.apiKeyCipher), baseUrl: Boolean(row?.baseUrl) },
    unreadable: Boolean(row?.apiKeyCipher) && !savedKey,
    endpointsVerified: endpointsVerified(),
  };
}

export function isAlrahuzConfigured(cfg: Pick<ResolvedAlrahuzConfig, "apiKey" | "baseUrl">): boolean {
  return Boolean(cfg.apiKey && cfg.baseUrl) && !isPlaceholder(cfg.apiKey) && !isPlaceholder(cfg.baseUrl);
}

/** Health view used for gating real vending — unchanged safety semantics. */
export function alrahuzHealthFromConfig(cfg: ResolvedAlrahuzConfig): ProviderHealth {
  const missing: string[] = [];
  if (!cfg.apiKey) missing.push("ALRAHUZ_API_KEY");
  if (!cfg.baseUrl) missing.push("ALRAHUZ_API_BASE_URL");
  if (!cfg.endpointsVerified) missing.push("ALRAHUZ_ENDPOINTS_VERIFIED");

  const notes: string[] = [];
  if (!cfg.endpointsVerified) {
    notes.push(
      "Endpoint paths have not been confirmed against the official Alrahuz API documentation. Real vending stays disabled until ALRAHUZ_ENDPOINTS_VERIFIED=true is set deliberately.",
    );
  }

  return {
    configured: missing.length === 0,
    verified: cfg.endpointsVerified,
    missing,
    endpointBase: cfg.baseUrl || null,
    notes,
  };
}

export async function loadAlrahuzHealth(): Promise<ProviderHealth> {
  return alrahuzHealthFromConfig(await resolveAlrahuzConfig());
}

/** The only shape the browser ever receives. Contains no secret value. */
export async function loadAlrahuzStatus(): Promise<AlrahuzSettingsStatus> {
  const [row, cfg] = await Promise.all([readRow(), resolveAlrahuzConfig()]);
  const configured = isAlrahuzConfigured(cfg);

  const state: AlrahuzConnectionState = !configured
    ? "not-configured"
    : row?.lastValidatedOk === true
      ? "connected"
      : row?.lastValidatedOk === false
        ? "failed"
        : "untested";

  return {
    provider: "alrahuz",
    state,
    configured,
    apiKey: {
      configured: Boolean(cfg.apiKey),
      stored: cfg.stored.apiKey,
      // A fixed mask only — never the key, its length or its last characters.
      masked: cfg.stored.apiKey ? MASK : null,
    },
    baseUrl: cfg.baseUrl || null,
    authScheme: cfg.authScheme,
    checkPath: cfg.checkPath,
    checkUrl: cfg.baseUrl ? `${cfg.baseUrl}${cfg.checkPath}` : null,
    source: cfg.source,
    unreadable: cfg.unreadable,
    endpointsVerified: cfg.endpointsVerified,
    missing: [cfg.apiKey ? null : "API key", cfg.baseUrl ? null : "Base URL"].filter(
      (value): value is string => Boolean(value),
    ),
    lastValidatedAt: row?.lastValidatedAt ? row.lastValidatedAt.toISOString() : null,
    lastValidatedOk: row?.lastValidatedOk ?? null,
    lastValidationMessage: row?.lastValidationMessage ?? null,
    encryption: vaultStatus(),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    createdAt: row?.createdAt ? row.createdAt.toISOString() : null,
  };
}

const BLOCKED_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

/**
 * Validates and canonicalises the provider base URL. The host is always the one
 * the administrator supplies from the Alrahuz documentation — this project never
 * guesses it — and HTTPS is required so the API key is never sent in the clear.
 */
export function normalizeBaseUrl(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter the Alrahuz API base URL (for example https://…)." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "That base URL is not a valid URL. Use the full address, including https://." };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "The base URL must start with https:// so the API key is never sent over an unencrypted connection.",
    };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Do not embed credentials in the base URL — the API key belongs in the key field." };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: "The base URL must not include a query string or fragment." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".") || BLOCKED_HOST.test(host)) {
    return {
      ok: false,
      error: "That host is not allowed. Enter the public HTTPS host from the Alrahuz documentation.",
    };
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return { ok: true, value: `${parsed.protocol}//${parsed.host}${path}` };
}

/** Read-only path from the provider's documentation, e.g. /api/user/ */
export function normalizeCheckPath(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: "" };
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return { ok: false, error: "The check path must start with a single / — for example /api/user/." };
  }
  if (trimmed.includes("://") || /\s/.test(trimmed)) {
    return { ok: false, error: "The check path must be a path only, with no scheme and no spaces." };
  }
  if (trimmed.length > 200) {
    return { ok: false, error: "The check path is too long. Use the documented path only." };
  }
  return { ok: true, value: trimmed };
}

function providerMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "detail", "msg", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export type SaveAlrahuzInput = {
  apiKey?: string;
  baseUrl?: string;
  authScheme?: string;
  checkPath?: string;
  /** Run the read-only connection test straight after saving. */
  verify?: boolean;
};

export type SaveAlrahuzResult =
  | { ok: true; message: string; status: AlrahuzSettingsStatus; validation: AlrahuzValidationResult | null }
  | { ok: false; error: string; field?: "apiKey" | "baseUrl" | "authScheme" | "checkPath" };

/**
 * Validates on the server, encrypts the key and stores everything. Empty inputs
 * keep the stored value, so a saved key never has to travel back through the form.
 */
export async function saveAlrahuzSettings(
  input: SaveAlrahuzInput,
  actor: { id: string; email: string },
  ip: string | null,
): Promise<SaveAlrahuzResult> {
  if (!vaultStatus().ready) {
    return {
      ok: false,
      error:
        "Credentials cannot be encrypted because no server-side key material is available. Set PAYMENT_SETTINGS_ENCRYPTION_KEY in the server environment first.",
    };
  }

  const row = await readRow();
  const currentKey = decryptSecret(row?.apiKeyCipher);
  const currentBaseUrl = (row?.baseUrl || envBaseUrl()).trim().replace(/\/+$/, "");

  const keyInput = (input.apiKey ?? "").trim();
  const baseUrlInput = (input.baseUrl ?? "").trim();

  if (keyInput) {
    if (/\s/.test(keyInput)) {
      return { ok: false, field: "apiKey", error: "The API key must not contain spaces. Copy it again from Alrahuz." };
    }
    if (keyInput.length < MIN_KEY_LENGTH || keyInput.length > MAX_KEY_LENGTH) {
      return {
        ok: false,
        field: "apiKey",
        error: `That does not look like an API key. It should be between ${MIN_KEY_LENGTH} and ${MAX_KEY_LENGTH} characters.`,
      };
    }
    if (isPlaceholder(keyInput)) {
      return { ok: false, field: "apiKey", error: "That placeholder is not a real API key." };
    }
  }

  const baseUrl = baseUrlInput ? normalizeBaseUrl(baseUrlInput) : null;
  if (baseUrlInput && baseUrl && !baseUrl.ok) {
    return { ok: false, field: "baseUrl", error: baseUrl.error };
  }
  const effectiveBaseUrl = (baseUrl && baseUrl.ok ? baseUrl.value : currentBaseUrl).trim();
  if (!effectiveBaseUrl) {
    return { ok: false, field: "baseUrl", error: "The Alrahuz API base URL is required." };
  }
  const rechecked = normalizeBaseUrl(effectiveBaseUrl);
  if (!rechecked.ok) return { ok: false, field: "baseUrl", error: rechecked.error };

  const authScheme = normalizeAuthScheme(input.authScheme || row?.authScheme || envAuthScheme());
  if (!AUTH_SCHEMES.includes(authScheme)) {
    return { ok: false, field: "authScheme", error: "Choose either the Token or Bearer authorization scheme." };
  }

  const checkPathInput = (input.checkPath ?? "").trim();
  const checkPath = normalizeCheckPath(checkPathInput);
  if (!checkPath.ok) return { ok: false, field: "checkPath", error: checkPath.error };

  let apiKeyCipher = row?.apiKeyCipher ?? null;
  if (keyInput) {
    try {
      apiKeyCipher = encryptSecret(keyInput);
    } catch {
      return { ok: false, error: "The API key could not be encrypted, so nothing was saved." };
    }
  }

  // Changing the key, host, scheme or check path invalidates the previous result.
  const credentialsChanged =
    Boolean(keyInput) ||
    rechecked.value !== currentBaseUrl ||
    authScheme !== normalizeAuthScheme(row?.authScheme || envAuthScheme()) ||
    (checkPath.value || "") !== (row?.checkPath || "");

  const data = {
    provider: "alrahuz",
    apiKeyCipher,
    baseUrl: rechecked.value,
    authScheme,
    checkPath: checkPath.value || null,
    updatedById: actor.id,
    ...(credentialsChanged
      ? {
          lastValidatedAt: null,
          lastValidatedOk: null,
          lastValidationState: null,
          lastValidationMessage: null,
        }
      : {}),
  };

  await prisma.alrahuzSettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...data },
    update: data,
  });

  await prisma.auditEvent
    .create({
      data: {
        actorId: actor.id,
        actorRole: "ADMIN",
        action: "alrahuz.settings_saved",
        entity: "AlrahuzSettings",
        entityId: ROW_ID,
        ip,
        // Non-secret metadata only: never the key, the ciphertext or a fragment.
        metadata: {
          apiKeyUpdated: Boolean(keyInput),
          baseUrlUpdated: Boolean(baseUrlInput),
          authScheme,
          checkPath: checkPath.value || null,
        },
      },
    })
    .catch(() => undefined);

  const validation = input.verify === true ? await testAlrahuzConnection(actor, ip) : null;

  return {
    ok: true,
    message: keyInput
      ? "Configuration saved. The API key was encrypted before storage."
      : currentKey
        ? "Configuration saved. The stored API key was left unchanged."
        : envApiKey() && !isPlaceholder(envApiKey())
          ? "Configuration saved. No new key was stored; the server environment key still applies."
          : "Configuration saved, but no API key is stored yet.",
    status: await loadAlrahuzStatus(),
    validation,
  };
}

/**
 * Read-only connectivity check: a single GET to the documented account path with
 * the stored key. It cannot place an order or move money, never retries, and
 * never returns the key or the request headers.
 */
export async function testAlrahuzConnection(
  actor: { id: string; email: string },
  ip: string | null,
): Promise<AlrahuzValidationResult> {
  const cfg = await resolveAlrahuzConfig();
  const checkedAt = new Date();

  if (!isAlrahuzConfigured(cfg)) {
    const message =
      "No Alrahuz API key and base URL are configured yet. Save both fields, then run the connection test.";
    await persistValidation({
      checkedAt,
      ok: false,
      state: "not-configured",
      message,
      actor,
      ip,
    });
    return {
      ok: false,
      state: "not-configured",
      message,
      checkedAt: checkedAt.toISOString(),
      path: null,
      httpStatus: null,
    };
  }

  const path = cfg.checkPath;
  const url = `${cfg.baseUrl}${path}`;
  let ok = false;
  let message = "";
  let httpStatus: number | null = null;

  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      timeoutMs: Math.min(cfg.timeoutMs, 15000),
      headers: {
        Accept: "application/json",
        Authorization: `${cfg.authScheme} ${cfg.apiKey}`,
      },
    });
    httpStatus = response.status;
    const payload = await readJsonSafe(response);

    if (response.status === 401 || response.status === 403) {
      message = `Alrahuz rejected the credentials (HTTP ${response.status}). Check that the key is copied in full and that the authorization scheme matches the documentation (currently ${cfg.authScheme}).`;
    } else if (response.ok) {
      ok = true;
      const detail = redact(providerMessage(payload) || "", [cfg.apiKey]).slice(0, 140);
      message =
        `Alrahuz answered the read-only GET ${path} with HTTP ${response.status}. ` +
        `Authentication was accepted with the ${cfg.authScheme} scheme. No transaction was performed.` +
        (detail ? ` Provider message: ${detail}` : "");
    } else {
      const detail = redact(providerMessage(payload) || "", [cfg.apiKey]).slice(0, 140);
      message = `Alrahuz returned HTTP ${response.status} for the read-only GET ${path}.${detail ? ` Provider message: ${detail}` : ""}`;
    }
  } catch (error) {
    message =
      error instanceof Error && error.name === "HttpTimeoutError"
        ? `The connection to ${cfg.baseUrl} timed out. Check the host and the server's network access, then try again.`
        : `Could not reach ${cfg.baseUrl}. Check the base URL and the server's network access, then try again.`;
  }

  const finalMessage = message.slice(0, 240);

  await persistValidation({
    checkedAt,
    ok,
    state: ok ? "connected" : "failed",
    message: finalMessage,
    actor,
    ip,
    httpStatus,
  });

  return {
    ok,
    state: ok ? "connected" : "failed",
    message: finalMessage,
    checkedAt: checkedAt.toISOString(),
    path,
    httpStatus,
  };
}

async function persistValidation(args: {
  checkedAt: Date;
  ok: boolean;
  state: AlrahuzConnectionState;
  message: string;
  actor: { id: string; email: string };
  ip: string | null;
  httpStatus?: number | null;
}) {
  await prisma.alrahuzSettings
    .upsert({
      where: { id: ROW_ID },
      create: {
        id: ROW_ID,
        provider: "alrahuz",
        lastValidatedAt: args.checkedAt,
        lastValidatedOk: args.ok,
        lastValidationState: args.state,
        lastValidationMessage: args.message,
        updatedById: args.actor.id,
      },
      update: {
        lastValidatedAt: args.checkedAt,
        lastValidatedOk: args.ok,
        lastValidationState: args.state,
        lastValidationMessage: args.message,
      },
    })
    .catch(() => undefined);

  await prisma.auditEvent
    .create({
      data: {
        actorId: args.actor.id,
        actorRole: "ADMIN",
        action: "alrahuz.connection_tested",
        entity: "AlrahuzSettings",
        entityId: ROW_ID,
        ip: args.ip,
        metadata: { ok: args.ok, state: args.state, httpStatus: args.httpStatus ?? null },
      },
    })
    .catch(() => undefined);
}

/** Removes the saved credentials. Environment variables, if any, still apply. */
export async function clearAlrahuzSettings(
  actor: { id: string; email: string },
  ip: string | null,
): Promise<AlrahuzSettingsStatus> {
  await prisma.alrahuzSettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID },
    update: {
      apiKeyCipher: null,
      baseUrl: null,
      checkPath: null,
      lastValidatedAt: null,
      lastValidatedOk: null,
      lastValidationState: null,
      lastValidationMessage: null,
      updatedById: actor.id,
    },
  });

  await prisma.auditEvent
    .create({
      data: {
        actorId: actor.id,
        actorRole: "ADMIN",
        action: "alrahuz.settings_cleared",
        entity: "AlrahuzSettings",
        entityId: ROW_ID,
        ip,
        metadata: {},
      },
    })
    .catch(() => undefined);

  return loadAlrahuzStatus();
}
