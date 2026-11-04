import { ok } from "@/lib/api";
import { loadAlrahuzHealth } from "@/lib/alrahuz-settings";
import { resendConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  isPaystackConfigured,
  paystackLiveBlocked,
  paystackProviderHealth,
  resolvePaystackConfig,
} from "@/lib/payment-gateway";

// Provider health, including Paystack test-mode and PalmPay channel readiness.
export const dynamic = "force-dynamic";

/**
 * Operational health endpoint. Reports presence/absence of configuration only —
 * never a key, URL credential or token.
 */
export async function GET() {
  let database = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  const alrahuz = await loadAlrahuzHealth();
  const paystackConfig = await resolvePaystackConfig();
  const paystack = paystackProviderHealth(paystackConfig);

  return ok({
    app: "dp-data-sub",
    database,
    providers: {
      alrahuz: {
        configured: alrahuz.configured,
        endpointsVerified: alrahuz.verified,
        missing: alrahuz.missing,
        notes: alrahuz.notes,
      },
      paystack: {
        ready: isPaystackConfigured(paystackConfig) && !paystackLiveBlocked(paystackConfig),
        missing: paystack.missing,
        testMode: paystack.testMode,
        palmPayEnabled: paystack.palmPayEnabled,
        liveBlocked: paystackLiveBlocked(paystackConfig),
        credentialSource: paystackConfig.source,
      },
      resend: { configured: resendConfig().configured },
    },
    time: new Date().toISOString(),
  });
}
