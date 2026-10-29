export const APP_NAME = "DP Data Sub";
export const APP_TAGLINE = "Your Data, Your Way.";
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@dpdatasub.ng";

/** Brand palette — mirrors the CSS tokens in globals.css. */
export const BRAND = {
  primary: "#087F5B",
  accent: "#22C55E",
  white: "#FFFFFF",
  background: "#F5F7F6",
  text: "#17211D",
  muted: "#6B7280",
  border: "#E5E7EB",
} as const;

export type ProviderHealth = {
  configured: boolean;
  verified: boolean;
  missing: string[];
  endpointBase: string | null;
  notes: string[];
};

/**
 * Alrahuz Data integration configuration.
 *
 * No official Alrahuz API reference was available in this project, and none
 * could be located publicly. Therefore NOTHING is hard-coded: the base URL and
 * every endpoint path must be supplied through environment variables after the
 * account owner confirms them against the provider dashboard / official docs.
 * Until then the integration reports "not configured" and never places a real
 * order or invents a price.
 */
export function alrahuzConfig() {
  const apiKey = process.env.ALRAHUZ_API_KEY?.trim() || "";
  const baseUrl = (process.env.ALRAHUZ_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return {
    apiKey,
    baseUrl,
    authScheme: process.env.ALRAHUZ_AUTH_SCHEME || "Token",
    paths: {
      dataPlans: process.env.ALRAHUZ_DATA_PLANS_PATH || "/api/data/",
      purchaseData: process.env.ALRAHUZ_PURCHASE_DATA_PATH || "/api/data/",
      requery: process.env.ALRAHUZ_REQUERY_PATH || "/api/data/",
      balance: process.env.ALRAHUZ_BALANCE_PATH || "/api/user/",
    },
    timeoutMs: Number(process.env.ALRAHUZ_TIMEOUT_MS || 15000),
    /** Set only once the account owner has confirmed the contract with Alrahuz. */
    endpointsVerified: process.env.ALRAHUZ_ENDPOINTS_VERIFIED === "true",
  };
}

export function alrahuzHealth(): ProviderHealth {
  const cfg = alrahuzConfig();
  const missing: string[] = [];
  if (!cfg.apiKey || cfg.apiKey === "YOUR_ALRAHUZ_API_KEY") missing.push("ALRAHUZ_API_KEY");
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

export function isAlrahuzReady(): boolean {
  return alrahuzHealth().configured;
}

export function paystackConfig() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  return {
    secretKey,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY?.trim() || "",
    baseUrl: (process.env.PAYSTACK_BASE_URL || "https://api.paystack.co").replace(/\/+$/, ""),
    timeoutMs: Number(process.env.PAYSTACK_TIMEOUT_MS || 20000),
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET?.trim() || secretKey,
  };
}

export function isPaystackReady(): boolean {
  const cfg = paystackConfig();
  return Boolean(cfg.secretKey && !cfg.secretKey.startsWith("YOUR_"));
}

export function paystackHealth() {
  const cfg = paystackConfig();
  const missing: string[] = [];
  if (!isPaystackReady()) missing.push("PAYSTACK_SECRET_KEY");
  if (!cfg.publicKey) missing.push("PAYSTACK_PUBLIC_KEY");
  if (!process.env.PAYSTACK_WEBHOOK_SECRET) missing.push("PAYSTACK_WEBHOOK_SECRET");
  return { configured: missing.length === 0, missing };
}

export function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  return {
    apiKey,
    from: process.env.EMAIL_FROM?.trim() || "DP Data Sub <onboarding@resend.dev>",
    configured: Boolean(apiKey && !apiKey.startsWith("YOUR_")),
  };
}

/** Admin emails are promoted to the ADMIN role at registration/session refresh. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Development-only helper: surfaces email verification / password reset links
 * in the UI when no email provider is configured. Never enabled in production
 * unless AUTH_DEV_LINKS is deliberately set to "true".
 */
export function devLinksEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEV_LINKS === "true";
}
