import { ok } from "@/lib/api";
import { alrahuzHealth, isPaystackReady, paystackHealth, resendConfig } from "@/lib/config";
import { prisma } from "@/lib/db";

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

  const alrahuz = alrahuzHealth();
  const paystack = paystackHealth();

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
      paystack: { ready: isPaystackReady(), missing: paystack.missing },
      resend: { configured: resendConfig().configured },
    },
    time: new Date().toISOString(),
  });
}
