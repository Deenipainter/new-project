import { badRequest, ok, readBody, serverError, unavailable, unauthorized } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { isPaystackReady } from "@/lib/config";
import { settlePaymentAttempt } from "@/lib/payments";

type Body = { reference?: string };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readBody<Body>(request);
  const reference = (body?.reference || "").trim();
  if (!reference) return badRequest("Payment reference is required.");

  if (!isPaystackReady()) {
    return unavailable(
      "Payments are not configured, so this payment cannot be verified.",
      "PAYMENTS_NOT_CONFIGURED",
    );
  }

  try {
    const result = await settlePaymentAttempt({ reference, userId: user.id, source: "verify" });
    return ok(result);
  } catch (error) {
    console.error("[payments/verify]", error instanceof Error ? error.message : error);
    return serverError("We could not verify that payment just now. Please retry.");
  }
}
