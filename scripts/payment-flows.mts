// Payment flow tests for wallet funding (Paystack + PalmPay channel).
//
// Runs the REAL settlement engine (src/lib/payments.ts), the REAL ledger
// (src/lib/wallet.ts), the REAL Paystack HTTP client and the REAL database
// against a LOCAL MOCK Paystack. No live money, no real provider calls.
//
// The mock only serves /transaction/initialize and /transaction/verify, using
// Paystack's documented payload shapes.
//
// Run:
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/payment-flows.mts
//
// Covers: successful payment, duplicate verify, duplicate webhook, cancelled
// checkout, failed payment, incorrect amount, wrong currency, unknown and
// foreign references, server-side channel resolution, client channel
// injection, and PalmPay availability gating.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const MOCK_PORT = Number(process.env.MOCK_PORT || 5555);
const AMOUNT = 250_000; // ₦2,500
const tag = randomUUID().slice(0, 6);
const email = `payflows-${tag}@example.invalid`;
const phone = `0809${String(Math.floor(1_000_000 + Math.random() * 8_999_999)).slice(0, 7)}`;

type Outcome = {
  status: string;
  amountKobo?: number;
  currency?: string;
  channel?: string;
  gateway?: string;
};

const outcomes = new Map<string, Outcome>();
const initChannels = new Map<string, string[] | null>();
const initAmounts = new Map<string, number>();

let passed = 0;
function ok(name: string, detail?: string) {
  passed += 1;
  console.log(`  ok  ${name}${detail ? ` (${detail})` : ""}`);
}

const mock = createServer((req, res) => {
  const url = req.url ?? "";
  res.setHeader("Content-Type", "application/json");

  if (req.method === "POST" && url.startsWith("/transaction/initialize")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}") as {
        reference?: string;
        amount?: number;
        channels?: string[];
      };
      const reference = parsed.reference ?? "unknown";
      initChannels.set(reference, Array.isArray(parsed.channels) ? parsed.channels : null);
      initAmounts.set(reference, Number(parsed.amount ?? 0));
      res.end(
        JSON.stringify({
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: `http://127.0.0.1:${MOCK_PORT}/checkout/${reference}`,
            access_code: "mock_access",
            reference,
          },
        }),
      );
    });
    return;
  }

  if (req.method === "GET" && url.startsWith("/transaction/verify/")) {
    const reference = decodeURIComponent(url.split("/transaction/verify/")[1] ?? "");
    const outcome = outcomes.get(reference) ?? { status: "abandoned" };
    res.end(
      JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          status: outcome.status,
          amount: outcome.amountKobo ?? initAmounts.get(reference) ?? 0,
          currency: outcome.currency ?? "NGN",
          reference,
          channel: outcome.channel ?? "card",
          gateway_response: outcome.gateway ?? (outcome.status === "success" ? "Approved" : outcome.status),
        },
      }),
    );
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ status: false, message: "not found" }));
});

async function main() {
  // Must be set before the app modules read configuration.
  process.env.PAYSTACK_SECRET_KEY = "sk_test_mock_local";
  process.env.PAYSTACK_PUBLIC_KEY = "pk_test_mock_local";
  process.env.PAYSTACK_WEBHOOK_SECRET = "sk_test_mock_local";
  process.env.PAYSTACK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`;
  process.env.PAYSTACK_PALMPAY_ENABLED = "true";

  await new Promise<void>((resolve) => mock.listen(MOCK_PORT, "127.0.0.1", resolve));

  const { prisma } = await import("../src/lib/db.ts");
  const { settlePaymentAttempt } = await import("../src/lib/payments.ts");
  const { initializeTransaction } = await import("../src/lib/providers/paystack.ts");
  const { paystackHealth } = await import("../src/lib/config.ts");
  const { getPaymentMethod, resolvePaymentMethods } = await import("../src/lib/payment-methods.ts");

  const health = paystackHealth();
  assert.equal(health.configured, true, "mock Paystack config must be complete");
  assert.equal(health.testMode, true, "tests must run against a test key");
  assert.equal(health.palmPayEnabled, true, "PalmPay flag must be respected");

  const user = await prisma.user.create({
    data: {
      fullName: "Payment Flows",
      email,
      phone,
      passwordHash: "not-used-by-this-test",
      referralCode: `TEST${tag.toUpperCase()}`,
      wallet: { create: { balanceKobo: 0 } },
    },
    select: { id: true },
  });

  const fund = async (requestedMethod?: string) => {
    const reference = `DPF-TEST${randomUUID().slice(0, 8).toUpperCase()}`;
    await prisma.paymentAttempt.create({
      data: {
        userId: user.id,
        reference,
        amountKobo: AMOUNT,
        provider: "paystack",
        status: "PENDING",
        requestedMethod: requestedMethod ?? null,
      },
    });
    // A real initialisation tells Paystack the amount; mirror that for verify.
    initAmounts.set(reference, AMOUNT);
    initChannels.set(reference, null);
    return reference;
  };

  const balance = async () =>
    (await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balanceKobo;

  const ledgerFor = (reference: string) =>
    prisma.ledgerEntry.count({ where: { userId: user.id, reference: `PAY-${reference}` } });

  try {
    // ---------------------------------------------------------------- success
    const ref1 = await fund();
    outcomes.set(ref1, { status: "success", channel: "bank" });
    const paid = await settlePaymentAttempt({ reference: ref1, userId: user.id, source: "verify" });
    assert.equal(paid.status, "SUCCESSFUL");
    assert.equal(paid.credited, true);
    assert.equal(paid.balanceKobo, AMOUNT);
    assert.equal(await balance(), AMOUNT);
    assert.equal(await ledgerFor(ref1), 1);

    const attempt1 = await prisma.paymentAttempt.findUniqueOrThrow({ where: { reference: ref1 } });
    assert.equal(attempt1.status, "SUCCESSFUL");
    assert.equal(attempt1.channel, "bank");
    assert.ok(attempt1.verifiedAt, "verification time must be recorded");
    ok("successful payment credits exactly the verified amount once");

    // ------------------------------------------------------- duplicate verify
    const replay = await settlePaymentAttempt({ reference: ref1, userId: user.id, source: "verify" });
    assert.equal(replay.alreadySettled, true);
    assert.equal(replay.credited, false);
    assert.equal(replay.balanceKobo, AMOUNT);
    assert.equal(await ledgerFor(ref1), 1);
    ok("duplicate verify does not credit twice");

    // ----------------------------------------------------- duplicate webhook
    for (let i = 0; i < 3; i += 1) {
      const hook = await settlePaymentAttempt({ reference: ref1, source: "webhook" });
      assert.equal(hook.status, "SUCCESSFUL");
      assert.equal(hook.credited, false);
    }
    assert.equal(await ledgerFor(ref1), 1, "one payment = one ledger row");
    assert.equal(await balance(), AMOUNT);
    ok("duplicate (and concurrent-style) webhook deliveries credit only once");

    // -------------------------------------------------------------- cancelled
    const ref2 = await fund();
    outcomes.set(ref2, { status: "abandoned", gateway: "Customer cancelled" });
    const cancelled = await settlePaymentAttempt({ reference: ref2, userId: user.id, source: "verify" });
    assert.equal(cancelled.status, "FAILED");
    assert.equal(cancelled.credited, false);
    assert.match(cancelled.message, /cancel/i);
    assert.equal(await ledgerFor(ref2), 0, "a cancelled payment must never touch the ledger");
    const attempt2 = await prisma.paymentAttempt.findUniqueOrThrow({ where: { reference: ref2 } });
    assert.equal(attempt2.status, "FAILED");
    assert.match(String(attempt2.failureReason), /cancelled/i);
    assert.equal(await balance(), AMOUNT);
    ok("cancelled checkout is recorded as failed with no credit");

    // ---------------------------------------------------------------- failed
    const ref3 = await fund();
    outcomes.set(ref3, { status: "failed", gateway: "Declined by issuer" });
    const failed = await settlePaymentAttempt({ reference: ref3, userId: user.id, source: "verify" });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.credited, false);
    assert.match(failed.message, /Declined/i);
    assert.equal(await ledgerFor(ref3), 0);
    ok("failed payment is not credited");

    // -------------------------------------------------- incorrect amount paid
    const ref4 = await fund();
    outcomes.set(ref4, { status: "success", amountKobo: AMOUNT - 100_000 });
    const mismatch = await settlePaymentAttempt({ reference: ref4, userId: user.id, source: "webhook" });
    assert.equal(mismatch.status, "FAILED");
    assert.equal(mismatch.credited, false);
    assert.match(mismatch.message, /did not match/i);
    assert.equal(await ledgerFor(ref4), 0);
    const attempt4 = await prisma.paymentAttempt.findUniqueOrThrow({ where: { reference: ref4 } });
    assert.equal(attempt4.status, "FAILED");
    assert.match(String(attempt4.failureReason), /mismatch/i);
    assert.equal(
      await prisma.auditEvent.count({
        where: { actorId: user.id, action: "payment.amount_mismatch", entityId: attempt4.id },
      }),
      1,
      "amount mismatch must leave an audit trail",
    );
    assert.equal(await balance(), AMOUNT);
    ok("incorrect amount is rejected, not credited, and audited");

    // ------------------------------------------------------- wrong currency
    const ref5 = await fund();
    outcomes.set(ref5, { status: "success", currency: "GHS" });
    const wrongCurrency = await settlePaymentAttempt({ reference: ref5, userId: user.id, source: "verify" });
    assert.equal(wrongCurrency.status, "FAILED");
    assert.equal(await ledgerFor(ref5), 0);
    ok("non-NGN confirmation is rejected");

    // ------------------------------------------- unknown / foreign reference
    const unknown = await settlePaymentAttempt({ reference: "DPF-DOES-NOT-EXIST", source: "webhook" });
    assert.equal(unknown.status, "FAILED");
    assert.match(unknown.message, /Unknown payment reference/i);

    const foreign = await settlePaymentAttempt({
      reference: ref1,
      userId: randomUUID(),
      source: "verify",
    });
    assert.equal(foreign.credited, false);
    assert.match(foreign.message, /does not belong/i);
    ok("unknown references and other users' payments are refused");

    // -------------------------------------------------- channel resolution
    assert.deepEqual(
      getPaymentMethod("palmpay").channels,
      ["bank"],
      "PalmPay must map to Paystack's bank channel",
    );
    assert.deepEqual(getPaymentMethod("any").channels, [], "the default method must not restrict channels");

    const palmRef = await fund("palmpay");
    const palmInit = await initializeTransaction({
      email,
      amountKobo: AMOUNT,
      reference: palmRef,
      callbackUrl: "http://localhost:3000/wallet/fund/callback",
      channels: getPaymentMethod("palmpay").channels,
      metadata: { requestedMethod: "palmpay" },
    });
    assert.match(palmInit.authorizationUrl, /checkout/);
    assert.deepEqual(initChannels.get(palmRef), ["bank"], "the request must carry channels: ['bank']");

    const anyRef = await fund();
    await initializeTransaction({
      email,
      amountKobo: AMOUNT,
      reference: anyRef,
      callbackUrl: "http://localhost:3000/wallet/fund/callback",
      channels: getPaymentMethod("any").channels,
    });
    assert.equal(initChannels.get(anyRef), null, "an empty channel list must be omitted entirely");
    ok("channel list is resolved server-side: PalmPay → ['bank'], default → unrestricted");

    outcomes.set(palmRef, { status: "success", channel: "bank" });
    const palmPaid = await settlePaymentAttempt({ reference: palmRef, userId: user.id, source: "verify" });
    assert.equal(palmPaid.status, "SUCCESSFUL");
    assert.equal(palmPaid.credited, true);
    assert.equal(await balance(), AMOUNT * 2);
    const palmAttempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { reference: palmRef } });
    assert.equal(palmAttempt.requestedMethod, "palmpay");
    assert.equal(palmAttempt.channel, "bank");
    ok("PalmPay payment credits normally and keeps both the chosen method and the real channel");

    // ------------------------------------------------- availability gating
    const disabled = resolvePaymentMethods({
      paymentsReady: true,
      declaredChannels: [],
      palmPayEnabled: false,
    }).find((method) => method.id === "palmpay");
    assert.equal(disabled?.available, false, "PalmPay must stay unavailable without the flag");
    assert.ok(disabled?.unavailableReason, "the operator must be told why");

    const noBank = resolvePaymentMethods({
      paymentsReady: true,
      declaredChannels: ["card"],
      palmPayEnabled: true,
    }).find((method) => method.id === "palmpay");
    assert.equal(noBank?.available, false, "a disabled bank channel also disables PalmPay");

    const enabled = resolvePaymentMethods({
      paymentsReady: true,
      declaredChannels: [],
      palmPayEnabled: true,
    }).find((method) => method.id === "palmpay");
    assert.equal(enabled?.available, true);
    ok("PalmPay availability follows the declared merchant configuration");

    assert.equal(await balance(), AMOUNT * 2, "only the two verified payments were credited");
    const ledgerTotal = await prisma.ledgerEntry.count({ where: { userId: user.id } });
    assert.equal(ledgerTotal, 2, "exactly two ledger rows exist for five payment attempts");
    ok("wallet balance and ledger match exactly the verified payments");

    console.log(`\nAll ${passed} payment flow checks passed.`);
  } finally {
    // Test rows only — nothing else in the database is touched.
    await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
    await prisma.paymentAttempt.deleteMany({ where: { userId: user.id } });
    await prisma.auditEvent.deleteMany({ where: { actorId: user.id } });
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("\nTest data removed; no other rows were touched.");
  }
}

main()
  .catch((error) => {
    console.error("\nPAYMENT FLOW TESTS FAILED");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (mock.listening) mock.close();
  });
