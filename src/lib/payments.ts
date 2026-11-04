import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { verifyTransaction } from "@/lib/providers/paystack";
import { qualifyReferralAndReward } from "@/lib/referrals";
import { WalletError, asWalletError, creditWalletInTransaction } from "@/lib/wallet";

export type SettlementResult = {
  reference: string;
  status: "SUCCESSFUL" | "FAILED" | "PENDING" | "REFUNDED";
  credited: boolean;
  alreadySettled: boolean;
  message: string;
  balanceKobo?: number;
};

/** Paystack reports these when the customer walked away or the charge died. */
const CANCELLED_STATUSES = new Set(["abandoned", "cancelled", "canceled", "reversed"]);

function ledgerReferenceFor(reference: string) {
  return `PAY-${reference}`;
}

/**
 * The ONLY place a wallet is credited from a payment.
 *
 * Requires independent server-side verification with Paystack. A redirect, a
 * query string or a client-submitted "success" is never enough.
 *
 * Idempotency and atomicity:
 *  - the attempt row must exist and belong to the caller;
 *  - an already-SUCCESSFUL attempt short-circuits;
 *  - the verified amount, currency and reference must match the attempt;
 *  - the ledger insert and the status flip happen in ONE serialisable
 *    transaction, so a crash cannot leave "credited but pending" behind;
 *  - `LedgerEntry.reference` is unique, so concurrent webhook + verify calls
 *    cannot both credit (the loser gets P2002 and reports "already applied").
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
      reference: attempt.reference,
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
    const cancelled = CANCELLED_STATUSES.has(verification.status.toLowerCase());
    // Never downgrade an already-successful attempt (the early return above
    // covers the common case; this guards a concurrent settlement).
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { not: "SUCCESSFUL" } },
      data: {
        status: "FAILED",
        channel: verification.channel ?? undefined,
        failureReason: cancelled
          ? `Cancelled by customer (${verification.status})`
          : verification.message || verification.status || "Not completed",
      },
    });
    return {
      reference: attempt.reference,
      status: "FAILED",
      credited: false,
      alreadySettled: false,
      message: cancelled
        ? "This payment was cancelled at checkout. Nothing was charged and your wallet was not credited."
        : verification.message || "Paystack has not confirmed this payment. Nothing was credited.",
    };
  }

  const mismatch: string[] = [];
  if (verification.amountKobo !== attempt.amountKobo) {
    mismatch.push(`amount expected ${attempt.amountKobo} kobo, provider confirmed ${verification.amountKobo} kobo`);
  }
  if (verification.currency !== "NGN") {
    mismatch.push(`currency expected NGN, provider confirmed ${verification.currency}`);
  }
  if (verification.reference !== attempt.reference) {
    mismatch.push(`reference expected ${attempt.reference}, provider confirmed ${verification.reference}`);
  }

  if (mismatch.length > 0) {
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { not: "SUCCESSFUL" } },
      data: {
        status: "FAILED",
        channel: verification.channel ?? undefined,
        failureReason: `Verification mismatch: ${mismatch.join("; ")}.`,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: attempt.userId,
        action: "payment.amount_mismatch",
        entity: "PaymentAttempt",
        entityId: attempt.id,
        actorRole: "SYSTEM",
        metadata: {
          expectedKobo: attempt.amountKobo,
          receivedKobo: verification.amountKobo,
          expectedCurrency: "NGN",
          receivedCurrency: verification.currency,
          providerReference: verification.reference,
          source: input.source,
        },
      },
    });
    return {
      reference: attempt.reference,
      status: "FAILED",
      credited: false,
      alreadySettled: false,
      message:
        "What the payment provider confirmed did not match this payment request, so nothing was credited. Support has the audit record.",
    };
  }

  const credited = await commitVerifiedCredit({
    attemptId: attempt.id,
    attemptReference: attempt.reference,
    userId: attempt.userId,
    amountKobo: attempt.amountKobo,
    channel: verification.channel,
    providerReference: verification.reference,
    source: input.source,
  });

  const wallet = await prisma.wallet.findUnique({ where: { userId: attempt.userId } });

  if (!credited) {
    return {
      reference: attempt.reference,
      status: "SUCCESSFUL",
      credited: false,
      alreadySettled: true,
      message: "This payment was already applied to your wallet.",
      balanceKobo: wallet?.balanceKobo ?? 0,
    };
  }

  await qualifyReferralAndReward(attempt.userId).catch((error) => {
    console.error("[referral] qualification failed", error instanceof Error ? error.message : error);
  });

  return {
    reference: attempt.reference,
    status: "SUCCESSFUL",
    credited: true,
    alreadySettled: false,
    message: "Payment verified and your wallet has been credited.",
    balanceKobo: wallet?.balanceKobo ?? 0,
  };
}

/**
 * Credit the wallet and mark the attempt SUCCESSFUL in a single commit.
 * Returns false when another path already applied this payment.
 */
async function commitVerifiedCredit(input: {
  attemptId: string;
  attemptReference: string;
  userId: string;
  amountKobo: number;
  channel: string | null;
  providerReference: string;
  source: "verify" | "webhook" | "admin";
}): Promise<boolean> {
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const fresh = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
          if (fresh.status === "SUCCESSFUL") return false;

          await creditWalletInTransaction(tx, {
            userId: input.userId,
            amountKobo: input.amountKobo,
            type: "FUNDING",
            narration: "Wallet funding (Paystack)",
            reference: ledgerReferenceFor(input.attemptReference),
            paymentId: input.attemptId,
            metadata: {
              channel: input.channel,
              requestedMethod: fresh.requestedMethod,
              source: input.source,
            },
          });

          await tx.paymentAttempt.update({
            where: { id: input.attemptId },
            data: {
              status: "SUCCESSFUL",
              verifiedAt: new Date(),
              channel: input.channel,
              providerReference: input.providerReference,
              failureReason: null,
            },
          });

          await tx.auditEvent.create({
            data: {
              actorId: input.userId,
              actorRole: "SYSTEM",
              action: "payment.credited",
              entity: "PaymentAttempt",
              entityId: input.attemptId,
              metadata: {
                amountKobo: input.amountKobo,
                channel: input.channel,
                requestedMethod: fresh.requestedMethod,
                source: input.source,
              },
            },
          });

          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );
    } catch (error) {
      const mapped = asWalletError(error);

      // Another delivery already wrote the ledger row: settle the status only.
      if (mapped instanceof WalletError && mapped.code === "DUPLICATE_REFERENCE") {
        await prisma.paymentAttempt.updateMany({
          where: { id: input.attemptId, status: { not: "SUCCESSFUL" } },
          data: {
            status: "SUCCESSFUL",
            verifiedAt: new Date(),
            channel: input.channel,
            providerReference: input.providerReference,
            failureReason: null,
          },
        });
        return false;
      }

      // Serialisation conflict: re-read once, then retry the commit.
      const serializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (serializationConflict) {
        const fresh = await prisma.paymentAttempt.findUnique({ where: { id: input.attemptId } });
        if (fresh?.status === "SUCCESSFUL") return false;
        continue;
      }

      throw mapped;
    }
  }

  throw new Error("Could not settle this payment after a retry. No wallet credit was applied twice.");
}
