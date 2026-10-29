/** All money in this project is an integer number of kobo (₦1 = 100 kobo). */

export const MIN_FUNDING_KOBO = 10_000; // ₦100
export const MAX_FUNDING_KOBO = 50_000_000; // ₦500,000

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

export function formatNaira(kobo: number, options?: { withDecimals?: boolean }): string {
  const naira = koboToNaira(kobo);
  const withDecimals = options?.withDecimals ?? naira % 1 !== 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })
    .format(naira)
    .replace("NGN", "₦")
    .replace(/\s+/g, "");
}

/** Accepts "1,500", "1500.50", "₦1 500" and returns kobo, or null if invalid. */
export function parseNairaInput(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return nairaToKobo(value);
}

export function newReference(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8)
    .toUpperCase();
  return `${prefix}-${stamp}${random}`;
}
