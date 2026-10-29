// Webhook idempotency + verified-credit test against a LOCAL MOCK Paystack.
// No live money, no real provider calls.
//
//   1. .env must temporarily contain:
//        PAYSTACK_SECRET_KEY=sk_test_mock_local
//        PAYSTACK_WEBHOOK_SECRET=sk_test_mock_local
//        PAYSTACK_BASE_URL=http://127.0.0.1:5555
//   2. run: NODE_OPTIONS=--conditions=react-server npx tsx scripts/payment-idempotency.mts
//   3. remove the mock keys afterwards (funding must not stay "enabled" on a mock).
//
// Verifies: a signed webhook credits exactly once, a replay cannot double-credit,
// an unsigned webhook is rejected, and a forged "success" redirect credits nothing.

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { prisma } from "../src/lib/db.ts";

const APP = process.env.BASE_URL || "http://localhost:3000";
const SECRET = process.env.PAYSTACK_SECRET_KEY || "sk_test_mock_local";
const MOCK_PORT = 5555;
const AMOUNT_KOBO = 250_000;
const tag = randomUUID().slice(0, 6);
const email = `pay-idem-${tag}@example.invalid`;
const phone = `0806${String(Math.floor(1_000_000 + Math.random() * 8_999_999)).slice(0, 7)}`;

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
      const reference = (JSON.parse(body || "{}") as { reference?: string }).reference ?? "unknown";
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
    res.end(
      JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          status: "success",
          amount: AMOUNT_KOBO,
          currency: "NGN",
          reference,
          channel: "card",
          gateway_response: "Approved by mock",
        },
      }),
    );
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ status: false, message: "not found" }));
});

function sign(body: string) {
  return createHmac("sha512", SECRET).update(body).digest("hex");
}

async function webhook(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${APP}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": signature ?? sign(body),
      "x-forwarded-for": "10.77.77.77",
    },
    body,
  });
  return response;
}

async function cleanup(userId?: string) {
  if (!userId) return;
  await prisma.ledgerEntry.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.paymentAttempt.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.auditEvent.deleteMany({ where: { actorId: userId } }).catch(() => undefined);
  await prisma.session.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.referral.deleteMany({ where: { refereeId: userId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

async function main() {
  await new Promise<void>((resolve) => mock.listen(MOCK_PORT, "127.0.0.1", resolve));

  const register = await fetch(`${APP}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.77.77.78" },
    body: JSON.stringify({
      fullName: "Payment Idempotency",
      email,
      phone,
      password: "TestPass123",
      confirmPassword: "TestPass123",
    }),
  });
  assert.equal(register.status, 201, "test user must be created");
  const cookie = (register.headers.getSetCookie?.() ?? []).map((v) => v.split(";")[0]).join("; ");
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });

  try {
    const health = await (await fetch(`${APP}/api/health`)).json();
    assert.equal(health.providers.paystack.ready, true, "mock Paystack config must be active");

    const fund = await fetch(`${APP}/api/wallet/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, "x-forwarded-for": "10.77.77.79" },
      body: JSON.stringify({ amountKobo: AMOUNT_KOBO }),
    });
    const funded = (await fund.json()) as { reference?: string; authorizationUrl?: string };
    assert.equal(fund.status, 200, JSON.stringify(funded));
    assert.ok(funded.reference, "a payment reference must be issued");
    assert.match(String(funded.authorizationUrl), /checkout/, "checkout URL must come from the provider");
    ok("funding creates a pending payment attempt via the provider");

    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { reference: funded.reference! },
    });
    assert.equal(attempt.status, "PENDING");
    assert.equal(attempt.amountKobo, AMOUNT_KOBO);
    const balanceBefore = (await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balanceKobo;
    assert.equal(balanceBefore, 0);
    ok("wallet is not credited before verification");

    const event = {
      event: "charge.success",
      data: { reference: funded.reference, amount: AMOUNT_KOBO, status: "success", currency: "NGN" },
    };

    const unsigned = await webhook(event, "deadbeef");
    assert.equal(unsigned.status, 401, "an invalid signature must be rejected");
    const afterUnsigned = (await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balanceKobo;
    assert.equal(afterUnsigned, 0);
    ok("an unsigned/forged webhook is rejected and credits nothing");

    const first = await webhook(event);
    assert.equal(first.status, 200);
    const balanceAfter = (await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balanceKobo;
    assert.equal(balanceAfter, AMOUNT_KOBO);
    const credits = await prisma.ledgerEntry.count({
      where: { userId: user.id, reference: `PAY-${funded.reference}` },
    });
    assert.equal(credits, 1);
    ok("a verified webhook credits the wallet exactly once");

    const replay = await webhook(event);
    assert.equal(replay.status, 200, "a replay is acknowledged");
    const balanceAfterReplay = (await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } }))
      .balanceKobo;
    assert.equal(balanceAfterReplay, AMOUNT_KOBO, "a duplicate webhook must never credit twice");
    const creditsAfterReplay = await prisma.ledgerEntry.count({
      where: { userId: user.id, reference: `PAY-${funded.reference}` },
    });
    assert.equal(creditsAfterReplay, 1);
    ok("replaying the same webhook does not double-credit");

    const callback = await fetch(`${APP}/api/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, "x-forwarded-for": "10.77.77.80" },
      body: JSON.stringify({ reference: funded.reference }),
    });
    const callbackBody = (await callback.json()) as { status?: string; credited?: boolean };
    assert.equal(callback.status, 200);
    assert.equal(callbackBody.credited, false, "the verify path must not credit again");
    const balanceAfterVerify = (await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } }))
      .balanceKobo;
    assert.equal(balanceAfterVerify, AMOUNT_KOBO);
    ok("server-side verification of an already-settled payment credits nothing further");

    const ledger = await prisma.ledgerEntry.findMany({ where: { userId: user.id } });
    assert.equal(ledger.length, 1, "exactly one ledger row for one payment");
    assert.equal(ledger[0].type, "FUNDING");
    assert.equal(ledger[0].balanceAfterKobo, AMOUNT_KOBO);
    ok("ledger contains exactly one funding entry for the payment");

    console.log(`\nPayment idempotency checks passed: ${passed}`);
  } finally {
    await cleanup(user.id);
    await prisma.$disconnect();
    mock.close();
  }
}

main().catch(async (error) => {
  console.error("Payment idempotency check failed:", error);
  await prisma.$disconnect();
  mock.close();
  process.exit(1);
});
