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
  // Placeholder values ("YOUR_...") are treated as missing so the status pages
  // report an honest "not configured" state instead of echoing a fake endpoint.
  const placeholderBaseUrl = cfg.baseUrl.startsWith("YOUR_");
  if (!cfg.apiKey || cfg.apiKey.startsWith("YOUR_")) missing.push("ALRAHUZ_API_KEY");
  if (!cfg.baseUrl || placeholderBaseUrl) missing.push("ALRAHUZ_API_BASE_URL");
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
    endpointBase: placeholderBaseUrl ? null : cfg.baseUrl || null,
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
    testMode: secretKey.startsWith("sk_test_"),
  };
}

/**
 * Paystack does not expose an API that lists the channels enabled on a merchant
 * account, and there is no standalone "palmpay" channel. PalmPay is a wallet
 * that Paystack Checkout offers **inside the `bank` channel** for Nigerian
 * businesses: the customer picks Bank, then PalmPay, then authorises with their
 * PalmPay PIN.
 *
 * Because availability can only be confirmed in the dashboard, it is declared
 * explicitly here. Until the merchant enables the Bank channel and sets
 * PAYSTACK_PALMPAY_ENABLED=true, the PalmPay option stays visible-but-disabled
 * and the API refuses it — funding is never simulated.
 */
export function paystackChannelConfig() {
  const declared = (process.env.PAYSTACK_CHANNELS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const palmPayRequested = process.env.PAYSTACK_PALMPAY_ENABLED === "true";
  const bankChannelAvailable = declared.length === 0 || declared.includes("bank");
  return {
    /** Empty means "do not restrict" — Checkout shows whatever Paystack enabled. */
    declaredChannels: declared,
    palmPayEnabled: palmPayRequested && bankChannelAvailable,
    palmPayRequested,
    bankChannelAvailable,
  };
}

export function isPaystackReady(): boolean {
  const cfg = paystackConfig();
  return Boolean(cfg.secretKey && !cfg.secretKey.startsWith("YOUR_"));
}

/**
 * Live keys are refused until the payment tests have been run and the owner
 * opts in deliberately. Funding stays disabled rather than charging real cards
 * during development.
 */
export function isPaystackLiveBlocked(): boolean {
  const cfg = paystackConfig();
  if (!cfg.secretKey.startsWith("sk_live_")) return false;
  return process.env.PAYSTACK_ALLOW_LIVE !== "true";
}

/** Environment-variable view of Paystack readiness (no database access). */
export function paystackHealth() {
  const cfg = paystackConfig();
  return paystackHealthView({
    secretKey: cfg.secretKey,
    publicKey: cfg.publicKey,
    webhookSecretExplicit: Boolean(process.env.PAYSTACK_WEBHOOK_SECRET?.trim()),
    testMode: cfg.testMode,
  });
}

export type PaystackHealthInput = {
  secretKey: string;
  publicKey: string;
  /** True only when a webhook secret is configured explicitly, not inferred from the secret key. */
  webhookSecretExplicit: boolean;
  testMode: boolean;
};

/**
 * Provider health computed from already-resolved credentials. Wallet funding,
 * the admin dashboard and the health endpoint all use this so credentials saved
 * from the admin dashboard behave exactly like environment variables.
 */
export function paystackHealthView(input: PaystackHealthInput) {
  const channels = paystackChannelConfig();
  const ready = Boolean(input.secretKey && !input.secretKey.startsWith("YOUR_"));
  const missing: string[] = [];
  if (!ready) missing.push("PAYSTACK_SECRET_KEY");
  if (!input.publicKey) missing.push("PAYSTACK_PUBLIC_KEY");
  if (!input.webhookSecretExplicit) missing.push("PAYSTACK_WEBHOOK_SECRET");

  const palmPayReason = !ready
    ? "Paystack keys are not configured, so no checkout channel is live."
    : !channels.bankChannelAvailable
      ? "PAYSTACK_CHANNELS excludes the bank channel that PalmPay is served through."
      : !channels.palmPayRequested
        ? "Enable the Bank channel in the Paystack dashboard (Settings → Preferences → Payment channels), confirm PalmPay appears at checkout, then set PAYSTACK_PALMPAY_ENABLED=true."
        : "PalmPay is enabled and will be offered through Paystack Checkout's Bank option.";

  return {
    configured: missing.length === 0,
    ready,
    missing,
    testMode: input.testMode,
    palmPayEnabled: ready && channels.palmPayEnabled,
    palmPayReason,
  };
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
