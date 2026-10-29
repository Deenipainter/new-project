import { headers } from "next/headers";

import { badRequest, forbidden, ok, readBody, serverError, unavailable } from "@/lib/api";
import { clientIpFrom, getCurrentUser } from "@/lib/auth";
import { isAlrahuzReady } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatNaira, newReference } from "@/lib/money";
import { reconcileOrder, refundOrder } from "@/lib/orders";
import { ProviderNotConfiguredError, fetchProviderPlans } from "@/lib/providers/alrahuz";
import { creditWallet, debitWallet } from "@/lib/wallet";
import type { ServiceStatus } from "@prisma/client";

type Body = {
  action?: string;
  orderId?: string;
  userId?: string;
  direction?: "CREDIT" | "DEBIT";
  amountKobo?: number;
  reason?: string;
  serviceKey?: string;
  status?: ServiceStatus;
};

const SERVICE_STATUSES: ServiceStatus[] = ["ENABLED", "PROVIDER_CONFIG_REQUIRED", "COMING_SOON"];

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  // Server-side role check. A user cannot grant themselves this role from the client.
  if (!admin) return forbidden("Administrator access only.");
  if (admin.role !== "ADMIN") return forbidden("Administrator access only.");

  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  const body = await readBody<Body>(request);
  if (!body?.action) return badRequest("Action is required.");

  try {
    switch (body.action) {
      case "refund": {
        if (!body.orderId) return badRequest("Order id is required.");
        if (!body.reason || body.reason.trim().length < 4) {
          return badRequest("A clear refund reason is required for the audit trail.");
        }
        const order = await refundOrder({
          orderId: body.orderId,
          reason: body.reason.trim(),
          actorId: admin.id,
        });
        return ok({ order: { id: order.id, status: order.status }, message: "Refund recorded." });
      }

      case "reconcile": {
        if (!body.orderId) return badRequest("Order id is required.");
        const order = await reconcileOrder(body.orderId, admin.id);
        return ok({ order: { id: order.id, status: order.status, providerStatus: order.providerStatus } });
      }

      case "adjustment": {
        if (!body.userId) return badRequest("Target user is required.");
        if (!body.direction || !["CREDIT", "DEBIT"].includes(body.direction)) {
          return badRequest("Direction must be CREDIT or DEBIT.");
        }
        const amount = Math.round(Number(body.amountKobo));
        if (!Number.isFinite(amount) || amount <= 0) return badRequest("Enter a positive amount in kobo.");
        if (!body.reason || body.reason.trim().length < 4) {
          return badRequest("A reason is required for every manual adjustment.");
        }

        const target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
        if (!target) return badRequest("That user does not exist.");

        const reference = newReference("ADJ");
        const result =
          body.direction === "CREDIT"
            ? await creditWallet({
                userId: target.id,
                amountKobo: amount,
                type: "ADMIN_ADJUSTMENT",
                narration: `Admin credit: ${body.reason.trim()}`.slice(0, 240),
                reference,
                metadata: { adminId: admin.id },
              })
            : await debitWallet({
                userId: target.id,
                amountKobo: amount,
                type: "ADMIN_ADJUSTMENT",
                narration: `Admin debit: ${body.reason.trim()}`.slice(0, 240),
                reference,
                metadata: { adminId: admin.id },
              });

        await prisma.auditEvent.create({
          data: {
            actorId: admin.id,
            actorRole: "ADMIN",
            action: `wallet.adjustment_${body.direction.toLowerCase()}`,
            entity: "User",
            entityId: target.id,
            ip,
            metadata: { amountKobo: amount, reason: body.reason.trim(), reference },
          },
        });

        return ok({
          balanceKobo: result.balanceAfterKobo,
          message: `${body.direction === "CREDIT" ? "Credited" : "Debited"} ${formatNaira(amount)}.`,
        });
      }

      case "set-service-status": {
        if (!body.serviceKey || !body.status || !SERVICE_STATUSES.includes(body.status)) {
          return badRequest("A service key and a valid status are required.");
        }
        const row = await prisma.serviceAvailability.upsert({
          where: { key: body.serviceKey },
          create: { key: body.serviceKey, name: body.serviceKey, status: body.status },
          update: { status: body.status },
        });
        await prisma.auditEvent.create({
          data: {
            actorId: admin.id,
            actorRole: "ADMIN",
            action: "service.status_changed",
            entity: "ServiceAvailability",
            entityId: row.id,
            ip,
            metadata: { key: body.serviceKey, status: body.status },
          },
        });
        return ok({ service: { key: row.key, status: row.status } });
      }

      case "sync-plans": {
        if (!isAlrahuzReady()) {
          return unavailable(
            "Alrahuz is not configured, so the live plan catalogue cannot be fetched. No plans were changed.",
            "PROVIDER_NOT_CONFIGURED",
          );
        }
        const plans = await fetchProviderPlans();
        let upserted = 0;
        for (const plan of plans) {
          await prisma.dataPlan.upsert({
            where: {
              network_dataType_planCode: {
                network: plan.network,
                dataType: plan.dataType,
                planCode: plan.planCode,
              },
            },
            create: {
              network: plan.network,
              dataType: plan.dataType,
              planCode: plan.planCode,
              name: plan.name,
              sizeMb: plan.sizeMb,
              validity: plan.validity,
              priceKobo: plan.priceKobo,
              costKobo: plan.costKobo,
              source: "PROVIDER",
            },
            update: {
              name: plan.name,
              sizeMb: plan.sizeMb,
              validity: plan.validity,
              priceKobo: plan.priceKobo,
              costKobo: plan.costKobo,
              source: "PROVIDER",
              active: true,
            },
          });
          upserted += 1;
        }
        await prisma.auditEvent.create({
          data: {
            actorId: admin.id,
            actorRole: "ADMIN",
            action: "plans.synced",
            ip,
            metadata: { upserted, skipped: 0 },
          },
        });
        return ok({ upserted, message: `${upserted} live plans imported from Alrahuz.` });
      }

      default:
        return badRequest("Unsupported action.");
    }
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return unavailable(error.message, "PROVIDER_NOT_CONFIGURED", { missing: error.missing });
    }
    console.error("[admin/action]", error instanceof Error ? error.message : error);
    return serverError("That administration action failed. No balance change was made unless a ledger entry exists.");
  }
}
