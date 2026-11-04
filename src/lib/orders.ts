import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { newReference } from "@/lib/money";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { loadAlrahuzHealth } from "@/lib/alrahuz-settings";
import {
  ProviderNotConfiguredError,
  purchaseData,
  requeryTransaction,
  type NormalizedStatus,
} from "@/lib/providers/alrahuz";
import { HttpTimeoutError } from "@/lib/http";

export class OrderError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OrderError";
    this.code = code;
    this.status = status;
  }
}

export type DataOrderInput = {
  userId: string;
  network: string;
  dataType: string;
  planCode: string;
  phone: string;
  idempotencyKey: string;
};

export async function placeDataOrder(input: DataOrderInput) {
  // 1. Idempotency: an identical key returns the original order, never a new debit.
  const existing = await prisma.vtuOrder.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new OrderError("IDEMPOTENCY_CONFLICT", "This request key belongs to another account.", 409);
    }
    return { order: existing, replayed: true };
  }

  const plan = await prisma.dataPlan.findFirst({
    where: {
      network: input.network,
      dataType: input.dataType,
      planCode: input.planCode,
      active: true,
    },
  });
  if (!plan) {
    throw new OrderError("PLAN_UNAVAILABLE", "That plan is not available for purchase right now.", 404);
  }
  if (plan.source === "REFERENCE") {
    throw new OrderError(
      "PLAN_NOT_LIVE",
      "This is a reference price supplied by the account owner, not a verified Alrahuz plan identifier, so it cannot be purchased yet. Live plans appear automatically once the provider catalogue is synced.",
      409,
    );
  }
  const providerHealth = await loadAlrahuzHealth();
  if (!providerHealth.configured) {
    throw new ProviderNotConfiguredError(providerHealth.missing);
  }

  const reference = newReference("DP");

  // 2. Create the order shell with a unique idempotency key (race-safe).
  let order;
  try {
    order = await prisma.vtuOrder.create({
      data: {
        userId: input.userId,
        reference,
        idempotencyKey: input.idempotencyKey,
        serviceType: "data",
        network: input.network,
        dataType: input.dataType,
        planCode: plan.planCode,
        planName: `${plan.name} · ${plan.validity}`,
        recipient: input.phone,
        amountKobo: plan.priceKobo,
        costKobo: plan.costKobo,
        status: "PENDING",
        providerName: "alrahuz",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.vtuOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay && replay.userId === input.userId) return { order: replay, replayed: true };
    }
    throw error;
  }

  // 3. Debit the wallet (atomic, overspend-safe). No debit happens on failure.
  try {
    await debitWallet({
      userId: input.userId,
      amountKobo: plan.priceKobo,
      type: "PURCHASE",
      narration: `${input.network} ${input.dataType} ${plan.name} → ${input.phone}`,
      reference: `DEBIT-${order.reference}`,
      orderId: order.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The wallet could not be debited for this order.";
    await prisma.vtuOrder.update({
      where: { id: order.id },
      data: { status: "FAILED", failureReason: message },
    });
    throw new OrderError("DEBIT_FAILED", message, 402);
  }

  // 4. Exactly one provider attempt. Never retried automatically.
  try {
    const result = await purchaseData({
      network: input.network,
      dataType: input.dataType,
      planCode: plan.planCode,
      phone: input.phone,
      customerReference: order.reference,
    });

    return { order: await applyProviderResult(order.id, result), replayed: false };
  } catch (error) {
    if (error instanceof HttpTimeoutError) {
      // The request may have reached the provider. Keep it pending and reconcile.
      const pending = await prisma.vtuOrder.update({
        where: { id: order.id },
        data: {
          status: "PENDING",
          providerStatus: "timeout",
          providerMessage:
            "The provider did not answer in time. This order stays pending until it is reconciled; it will not be resubmitted automatically.",
        },
      });
      return { order: pending, replayed: false };
    }

    const message = error instanceof Error ? error.message : "Provider request failed.";
    const refunded = await failAndRefund(order.id, message);
    throw new OrderError("PROVIDER_ERROR", message, 502);
  }
}

function mapStatus(status: NormalizedStatus): "SUCCESSFUL" | "PENDING" | "FAILED" {
  if (status === "successful") return "SUCCESSFUL";
  if (status === "failed") return "FAILED";
  return "PENDING";
}

export async function applyProviderResult(
  orderId: string,
  result: { status: NormalizedStatus; providerReference: string | null; message: string; rawStatus: string | null },
) {
  const mapped = mapStatus(result.status);
  const order = await prisma.vtuOrder.findUniqueOrThrow({ where: { id: orderId } });

  const updated = await prisma.vtuOrder.update({
    where: { id: orderId },
    data: {
      status: mapped === "SUCCESSFUL" ? "SUCCESSFUL" : mapped === "FAILED" ? "FAILED" : "PENDING",
      providerReference: result.providerReference ?? order.providerReference,
      providerStatus: result.rawStatus,
      providerMessage: result.message,
      failureReason: mapped === "FAILED" ? result.message : null,
    },
  });

  if (mapped === "FAILED") {
    return refundOrder({ orderId, reason: `Provider declined the order: ${result.message}` });
  }
  return updated;
}

export async function failAndRefund(orderId: string, reason: string) {
  await prisma.vtuOrder.update({
    where: { id: orderId },
    data: { status: "FAILED", failureReason: reason, providerMessage: reason },
  });
  return refundOrder({ orderId, reason });
}

/**
 * Refunds a debited order exactly once. The ledger reference is derived from
 * the order reference, and the ledger reference column is unique, so a repeat
 * call can never credit twice.
 */
export async function refundOrder(input: {
  orderId: string;
  reason: string;
  actorId?: string;
}) {
  const order = await prisma.vtuOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderError("ORDER_NOT_FOUND", "Order not found.", 404);
  if (order.refundedAt) return order;

  const refundReference = `REFUND-${order.reference}`;
  try {
    await creditWallet({
      userId: order.userId,
      amountKobo: order.amountKobo,
      type: "REFUND",
      narration: `Refund for ${order.reference}: ${input.reason}`.slice(0, 240),
      reference: refundReference,
      orderId: order.id,
    });
  } catch (error) {
    // Duplicate refund attempt: the ledger already has it, so just mark the order.
    const duplicate =
      error instanceof Error && "code" in error && (error as { code?: string }).code === "DUPLICATE_REFERENCE";
    if (!duplicate) throw error;
  }

  const updated = await prisma.vtuOrder.update({
    where: { id: order.id },
    data: {
      status: "REFUNDED",
      refundedAt: order.refundedAt ?? new Date(),
      failureReason: order.failureReason ?? input.reason,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorId ? "ADMIN" : "SYSTEM",
      action: "order.refunded",
      entity: "VtuOrder",
      entityId: order.id,
      metadata: { reference: order.reference, amountKobo: order.amountKobo, reason: input.reason },
    },
  });

  return updated;
}

/** Reconciles a pending order against the provider. Never re-submits a purchase. */
export async function reconcileOrder(orderId: string, actorId?: string) {
  const order = await prisma.vtuOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("ORDER_NOT_FOUND", "Order not found.", 404);
  if (order.status !== "PENDING") return order;

  const providerHealth = await loadAlrahuzHealth();
  if (!providerHealth.configured) throw new ProviderNotConfiguredError(providerHealth.missing);

  const result = await requeryTransaction(order.providerReference ?? order.reference);

  await prisma.auditEvent.create({
    data: {
      actorId: actorId ?? null,
      actorRole: actorId ? "ADMIN" : "SYSTEM",
      action: "order.reconciled",
      entity: "VtuOrder",
      entityId: order.id,
      metadata: { providerStatus: result.rawStatus, mapped: result.status },
    },
  });

  if (result.status === "unknown") {
    return prisma.vtuOrder.update({
      where: { id: order.id },
      data: {
        providerStatus: result.rawStatus,
        providerMessage:
          "Provider returned an unrecognised status. The order stays pending until it is confirmed.",
      },
    });
  }

  return applyProviderResult(order.id, result);
}
