import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Server-only vault for payment credentials.
 *
 * Secrets are encrypted with AES-256-GCM *before* they are written to
 * PostgreSQL, so the database only ever holds ciphertext. The key material never
 * lives in the database, in a client bundle or in localStorage:
 *
 *   1. PAYMENT_SETTINGS_ENCRYPTION_KEY (dedicated, preferred)
 *   2. otherwise derived from another server-only secret already present in the
 *      runtime (AUTH_SECRET / SESSION_SECRET / DATABASE_URL)
 *
 * Losing the key material means the stored ciphertext can no longer be decrypted;
 * that is reported as "configured but unreadable" instead of being silently
 * ignored, so an administrator knows to re-enter the credentials.
 */
const CONTEXT = "dpds.payment-gateway.v1";
const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

export type VaultKeySource = "dedicated-env" | "derived-server-secret" | "unavailable";

function digest(material: string): Buffer {
  return createHash("sha256").update(material).digest();
}

function masterKey(): { key: Buffer; source: VaultKeySource } {
  const dedicated = process.env.PAYMENT_SETTINGS_ENCRYPTION_KEY?.trim();
  // A documented placeholder ("YOUR_…") is not key material: encrypting with it
  // would make every stored credential unreadable the moment the real key is set.
  const usableDedicated = dedicated && dedicated.length >= 16 && !dedicated.startsWith("YOUR_") ? dedicated : "";
  if (usableDedicated) {
    return { key: digest(`${CONTEXT}:dedicated:${usableDedicated}`), source: "dedicated-env" };
  }

  const shared = (
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL ||
    ""
  ).trim();
  if (shared.length >= 16) {
    return { key: digest(`${CONTEXT}:shared:${shared}`), source: "derived-server-secret" };
  }

  return { key: Buffer.alloc(32), source: "unavailable" };
}

export function vaultStatus(): {
  ready: boolean;
  algorithm: string;
  keySource: VaultKeySource;
  detail: string;
} {
  const { source } = masterKey();
  return {
    ready: source !== "unavailable",
    algorithm: "AES-256-GCM",
    keySource: source,
    detail:
      source === "dedicated-env"
        ? "Encrypted at rest with AES-256-GCM. The key is held in PAYMENT_SETTINGS_ENCRYPTION_KEY on the server."
        : source === "derived-server-secret"
          ? "Encrypted at rest with AES-256-GCM. The key is derived from an existing server-only secret — set PAYMENT_SETTINGS_ENCRYPTION_KEY to give payment settings their own key."
          : "No server-side key material is available, so credentials cannot be encrypted. Set PAYMENT_SETTINGS_ENCRYPTION_KEY before saving keys.",
  };
}

/** Encrypts a secret. Throws when no key material exists — never stores plaintext. */
export function encryptSecret(plaintext: string): string {
  const { key, source } = masterKey();
  if (source === "unavailable") {
    throw new Error("PAYMENT_SETTINGS_ENCRYPTION_KEY is not configured, so the credential cannot be encrypted.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a stored secret. Returns null when the value is absent, malformed, or
 * was encrypted with key material this runtime does not have. It never throws and
 * never logs the ciphertext or the key.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  const { key, source } = masterKey();
  if (source === "unavailable") return null;

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return plaintext || null;
  } catch {
    return null;
  }
}
