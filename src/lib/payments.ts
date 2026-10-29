import "server-only";

import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/wallet";
import { verifyTransaction } from "@/lib/providers/paystack";
import { qualifyReferralAndReward } from "@/lib/referrals";

export type SettlementResult = {
  reference: string;
  status: "SUCCESSFUL" | "FAILED" | "PENDING" | "REFUNDED";
  credited: boolean;
  alreadySettled: boolean;
  message: string;
  balanceKobo?: number;
};

/**
 * The ONLY place a wallet is credited from a payment.
 *
 * Requires independent server-side verification with Paystack. A redirect,
 * query string or client-submitted "success" is never enough. The ledger
 * reference is unique, so a duplicate call (webhook retry, verify + webhook
 * race) cannot credit twice.
 */
export async function settlePaymentAttempt(input: {
  reference: string;
  userId?: string;
  source: "verify" | "webhook" | "admin";
}): Promise<SettlementResult> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { reference: input.reference } });
  if (!attempt) {
    return {
      reference: input.reference,
      status: "FAILED",
      credited: false,
      alreadySettled: false,
      message: "Unknown payment reference.",
    };
  }
  if (input.userId && attempt.userId !== input.userId) {
    return {
      reference: input.reference,
      status: attempt.status,
      credited: false,
      alreadySettled: false,
      message: "This payment does not belong to your account.",
    };
  }
  if (attempt.status === "SUCCESSFUL") {
    const wallet = await prisma.wallet.findUnique({ where: { userId: attempt.userId } });
    return {
      reference: attempt.reference,
      status: "SUCCESSFUL",
      credited: false,
      alreadySettled: true,
      message: "This payment was already credited to your wallet.",
      balanceKobo: wallet?.balanceKobo ?? 0,
    };
  }

  let verification;
  try {
    verification = await verifyTransaction(attempt.reference);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    return {
      reference: attempt.reference,
      status: "PENDING",
      credited: false,
      alreadySettled: false,
      message: `We could not verify this payment yet: ${message}`,
    };
  }

  if (!verification.paid) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "FAILED", failureReason: verification.message || verification.status },
    });
    return {
      reference: attempt.reference,
      status: "FAILED",
      credited: false,
      alreadySettled: false,
      message: verification.message || "Paystack has not confirmed this payment.",
    };
  }

  if (verification.amountKobo !== attempt.amountKobo || verification.currency !== "NGN") {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        failureReason: `Amount/currency mismatch: expected ${attempt.amountKobo} NGN, got ${verification.amountKobo} ${verification.currency}.`,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: attempt.userId,
        action: "payment.amount_mismatch",
        entity: "PaymentAttempt",
        entityId: attempt.id,
        actorRole: "SYSTEM",
        metadata: { expectedKobo: attempt.amountKobo, receivedKobo: verification.amountKobo },
      },
    });
    return {
      reference: attempt.reference,
      status: "FAILED",
      credited: false,
      alreadySettled: false,
      message:
        "The amount confirmed by the payment provider did not match this payment request, so nothing was credited. Support has the audit record.",
    };
  }

  let credited = false;
  try {
    await creditWallet({
      userId: attempt.userId,
      amountKobo: attempt.amountKobo,
      type: "FUNDING",
      narration: "Wallet funding (Paystack)",
      reference: `PAY-${attempt.reference}`,
      paymentId: attempt.id,
      metadata: { channel: verification.channel, source: input.source },
    });
    credited = true;
  } catch (error) {
    const duplicate =
      error instanceof Error && "code" in error && (error as { code?: string }).code === "DUPLICATE_REFERENCE";
    if (!duplicate) throw error;
    // Another path already credited this reference; fall through to status update.
  }

  const updated = await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "SUCCESSFUL",
      verifiedAt: new Date(),
      channel: verification.channel,
      providerReference: verification.reference,
      failureReason: null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorId: attempt.userId,
      actorRole: "SYSTEM",
      action: "payment.credited",
      entity: "PaymentAttempt",
      entityId: updated.id,
      metadata: { amountKobo: updated.amountKobo, source: input.source, credited },
    },
  });

  await qualifyReferralAndReward(attempt.userId).catch((error) => {
    console.error("[referral] qualification failed", error instanceof Error ? error.message : error);
  });

  const wallet = await prisma.wallet.findUnique({ where: { userId: attempt.userId } });
  return {
    reference: attempt.reference,
    status: "SUCCESSFUL",
    credited,
    alreadySettled: !credited,
    message: credited
      ? "Payment verified and your wallet has been credited."
      : "This payment was already applied to your wallet.",
    balanceKobo: wallet?.balanceKobo ?? 0,
  };
}
