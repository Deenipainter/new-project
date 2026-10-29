/**
 * Pure provider-response helpers. Kept free of `server-only` and of any network
 * or database access so they can be exercised directly by checks/tests.
 */

export type NormalizedStatus = "successful" | "processing" | "failed" | "unknown";

/** Normalises the provider's loosely-typed status strings into our own set. */
export function normalizeStatus(value: unknown): NormalizedStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["success", "successful", "completed", "complete", "delivered", "done"].includes(raw)) {
    return "successful";
  }
  if (["processing", "pending", "queued", "in_progress", "inprogress", "initiated"].includes(raw)) {
    return "processing";
  }
  if (["failed", "failure", "error", "cancelled", "canceled", "rejected", "refunded"].includes(raw)) {
    return "failed";
  }
  return "unknown";
}

/** "1GB" -> 1024, "500MB" -> 500, "1.5 GB" -> 1536, anything else -> 0. */
export function parseSizeMb(input: string): number {
  const text = String(input || "").toLowerCase();
  const match = text.match(/([\d.]+)\s*(gb|mb)/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  return Math.round(match[2] === "gb" ? value * 1024 : value);
}

/** Naira (as returned by providers) -> integer kobo. */
export function nairaToKoboValue(value: unknown): number {
  const naira = Number(value ?? 0);
  if (!Number.isFinite(naira) || naira <= 0) return 0;
  return Math.round(naira * 100);
}

/** First present, non-empty key from a loosely-typed provider payload. */
export function pick(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}
