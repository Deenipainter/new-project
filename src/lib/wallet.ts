import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { newReference } from "@/lib/money";
import type { LedgerDirection, LedgerType } from "@prisma/client";

export class WalletError extends Error {
  code: "WALLET_MISSING" | "INSUFFICIENT_FUNDS" | "DUPLICATE_REFERENCE" | "INVALID_AMOUNT";
  constructor(code: WalletError["code"], message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

type MutateArgs = {
  userId: string;
  amountKobo: number;
  type: LedgerType;
  narration: string;
  reference?: string;
  orderId?: string;
  paymentId?: string;
  metadata?: Record<string, unknown>;
};

const ISO_SERIALIZABLE = Prisma.TransactionIsolationLevel.Serializable;

/**
 * Append a ledger row and update the cached wallet balance atomically.
 * The ledger is the source of truth; wallet.balanceKobo is a derived cache that
 * is only ever written inside these transactions.
 */
export async function writeEntryInTransaction(
  tx: Prisma.TransactionClient,
  direction: LedgerDirection,
  args: MutateArgs,
) {
  const { userId, amountKobo, type, narration, reference, orderId, paymentId, metadata } = args;
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new WalletError("INVALID_AMOUNT", "Amount must be a positive whole number of kobo.");
  }

  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new WalletError("WALLET_MISSING", "No wallet exists for this account.");

  let balanceAfter: number;

  if (direction === "DEBIT") {
    // Conditional UPDATE keeps concurrent debits from overspending.
    const result = await tx.wallet.updateMany({
      where: { id: wallet.id, balanceKobo: { gte: amountKobo } },
      data: { balanceKobo: { decrement: amountKobo } },
    });
    if (result.count !== 1) {
      throw new WalletError("INSUFFICIENT_FUNDS", "Your wallet balance is too low for this transaction.");
    }
    const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    balanceAfter = fresh.balanceKobo;
  } else {
    const fresh = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceKobo: { increment: amountKobo } },
    });
    balanceAfter = fresh.balanceKobo;
  }

  await tx.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      userId,
      direction,
      type,
      amountKobo,
      balanceAfterKobo: balanceAfter,
      reference: reference || newReference(direction === "CREDIT" ? "CR" : "DR"),
      narration,
      orderId: orderId ?? null,
      paymentId: paymentId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  return { balanceAfterKobo: balanceAfter };
}

/** Maps a unique-reference violation onto the wallet-specific error. */
export function asWalletError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new WalletError("DUPLICATE_REFERENCE", "This transaction reference has already been applied.");
  }
  return error;
}

async function writeEntry(direction: LedgerDirection, args: MutateArgs) {
  return prisma.$transaction((tx) => writeEntryInTransaction(tx, direction, args), {
    isolationLevel: ISO_SERIALIZABLE,
    timeout: 15000,
  });
}

export async function creditWallet(args: MutateArgs) {
  try {
    return await writeEntry("CREDIT", args);
  } catch (error) {
    throw asWalletError(error);
  }
}

/**
 * Credit inside a caller-owned transaction so the ledger row, the wallet
 * balance and the payment status can commit or roll back together.
 */
export async function creditWalletInTransaction(tx: Prisma.TransactionClient, args: MutateArgs) {
  try {
    return await writeEntryInTransaction(tx, "CREDIT", args);
  } catch (error) {
    throw asWalletError(error);
  }
}

export async function debitWallet(args: MutateArgs) {
  try {
    return await writeEntry("DEBIT", args);
  } catch (error) {
    throw asWalletError(error);
  }
}

export async function getWalletSnapshot(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return { balanceKobo: wallet?.balanceKobo ?? 0 };
}
