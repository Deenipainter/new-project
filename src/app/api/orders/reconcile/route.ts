import { badRequest, ok, readBody, serverError, unauthorized } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reconcileOrder } from "@/lib/orders";
import { ProviderNotConfiguredError } from "@/lib/providers/alrahuz";

type Body = { orderId?: string };

/** A user may only reconcile their own pending order, and nothing is resubmitted. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readBody<Body>(request);
  const orderId = (body?.orderId || "").trim();
  if (!orderId) return badRequest("Order id is required.");

  const order = await prisma.vtuOrder.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order) return badRequest("That order is not on your account.");

  try {
    const updated = await reconcileOrder(order.id);
    return ok({
      order: {
        id: updated.id,
        status: updated.status,
        providerStatus: updated.providerStatus,
        providerMessage: updated.providerMessage,
      },
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return ok({ error: error.message, code: "PROVIDER_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("[orders/reconcile]", error instanceof Error ? error.message : error);
    return serverError("We could not check that order with the provider yet.");
  }
}
