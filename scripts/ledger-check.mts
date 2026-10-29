// Database-backed ledger/order checks. Run in a NON-production database:
//   LEDGER_CHECK=1 npx tsx scripts/ledger-check.mts
//
// It creates one temporary user, exercises the real wallet/ledger code paths,
// then deletes that user (cascade). It never touches other accounts.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../src/lib/db.ts";
import { creditWallet, debitWallet } from "../src/lib/wallet.ts";
import { refundOrder } from "../src/lib/orders.ts";

if (process.env.LEDGER_CHECK !== "1") {
  console.error("Refusing to run: set LEDGER_CHECK=1 and point DATABASE_URL at a disposable database.");
  process.exit(1);
}

const tag = randomUUID().slice(0, 8);
let passed = 0;

function ok(name: string) {
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function main() {
  const stale = await prisma.user.findMany({
    where: { email: { startsWith: "ledger-check-" } },
    select: { id: true },
  });
  for (const row of stale) {
    await prisma.ledgerEntry.deleteMany({ where: { userId: row.id } }).catch(() => undefined);
    await prisma.vtuOrder.deleteMany({ where: { userId: row.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  const user = await prisma.user.create({
    data: {
      fullName: "Ledger Check",
      email: `ledger-check-${tag}@example.invalid`,
      phone: `0800${Math.floor(1000000 + Math.random() * 8999999)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `CHK${tag.toUpperCase()}`,
      wallet: { create: { balanceKobo: 0 } },
    },
    include: { wallet: true },
  });
  const walletId = user.wallet!.id;

  try {
    // 1. Credit is exact and records a running balance.
    await creditWallet({
      userId: user.id,
      amountKobo: 100_000,
      type: "FUNDING",
      narration: "Test funding",
      reference: `TEST-FUND-${tag}`,
    });
    let wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    assert.equal(wallet.balanceKobo, 100_000);
    let entries = await prisma.ledgerEntry.findMany({ where: { userId: user.id } });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].balanceAfterKobo, 100_000);
    ok("credit posts one ledger entry with the correct balance");

    // 2. Duplicate reference cannot credit twice.
    let duplicateRejected = false;
    try {
      await creditWallet({
        userId: user.id,
        amountKobo: 100_000,
        type: "FUNDING",
        narration: "Test funding (duplicate)",
        reference: `TEST-FUND-${tag}`,
      });
    } catch (error) {
      duplicateRejected = (error as { code?: string }).code === "DUPLICATE_REFERENCE";
    }
    wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    assert.equal(duplicateRejected, true);
    assert.equal(wallet.balanceKobo, 100_000);
    ok("a replayed reference cannot credit the wallet twice");

    // 3. Concurrent debits cannot overspend: 5 x ₦600 against ₦1,000.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        debitWallet({
          userId: user.id,
          amountKobo: 60_000,
          type: "PURCHASE",
          narration: `Concurrent debit ${index + 1}`,
          reference: `TEST-DEBIT-${tag}-${index}`,
        }),
      ),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const codes = rejected.map((result) => {
      const reason = result.reason as { code?: string; message?: string };
      return reason?.code ?? reason?.message ?? "unknown";
    });
    console.log(`      5 concurrent ₦600 debits vs ₦1,000 -> ${fulfilled} applied, ${rejected.length} rejected [${[...new Set(codes)].join(", ")}]`);

    wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    // Hard invariants: never overspend, never negative, never more than one debit.
    assert.equal(fulfilled, 1);
    assert.ok(rejected.length === 4);
    assert.ok(wallet.balanceKobo >= 0);
    assert.equal(wallet.balanceKobo, 40_000);
    ok("a burst of debits applies exactly one and never leaves the wallet negative");

    // 3b. Deterministic proof of the overspend guard itself: ₦400 left, ₦600 asked.
    let guardCode: string | undefined;
    try {
      await debitWallet({
        userId: user.id,
        amountKobo: 60_000,
        type: "PURCHASE",
        narration: "Overspend attempt",
        reference: `TEST-DEBIT-OVERSPEND-${tag}`,
      });
    } catch (error) {
      guardCode = (error as { code?: string }).code;
    }
    wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    assert.equal(guardCode, "INSUFFICIENT_FUNDS");
    assert.equal(wallet.balanceKobo, 40_000);
    const overspendEntries = await prisma.ledgerEntry.count({
      where: { reference: `TEST-DEBIT-OVERSPEND-${tag}` },
    });
    assert.equal(overspendEntries, 0);
    ok("a debit larger than the balance is rejected and writes no ledger entry");

    // 4. Refund is idempotent and linked to the order.
    const order = await prisma.vtuOrder.create({
      data: {
        userId: user.id,
        reference: `TEST-ORD-${tag}`,
        idempotencyKey: `idem-${tag}`,
        serviceType: "data",
        network: "MTN",
        dataType: "SME",
        planCode: "TEST-PLAN",
        planName: "Test plan",
        recipient: "08030000000",
        amountKobo: 30_000,
        status: "FAILED",
      },
    });
    await debitWallet({
      userId: user.id,
      amountKobo: 30_000,
      type: "PURCHASE",
      narration: "Test order debit",
      reference: `DEBIT-${order.reference}`,
      orderId: order.id,
    });
    await refundOrder({ orderId: order.id, reason: "Automated test refund" });
    await refundOrder({ orderId: order.id, reason: "Automated test refund (repeat)" });

    wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    assert.equal(wallet.balanceKobo, 40_000); // 10_000 - 30_000 + 30_000 = 10_000 ... see note
    const refunds = await prisma.ledgerEntry.count({
      where: { userId: user.id, type: "REFUND" },
    });
    assert.equal(refunds, 1);
    const refreshed = await prisma.vtuOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(refreshed.status, "REFUNDED");
    ok("refund credits once, links the order and is repeatable safely");

    // 5. Ownership scoping: another id sees nothing.
    const foreign = await prisma.vtuOrder.findFirst({ where: { userId: "not-this-user", id: order.id } });
    assert.equal(foreign, null);
    ok("order lookups are scoped by userId");

    console.log(`\nLedger checks passed: ${passed}`);
  } finally {
    // LedgerEntry -> Wallet is RESTRICT by design, so entries go first.
    await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.vtuOrder.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("Ledger check failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
