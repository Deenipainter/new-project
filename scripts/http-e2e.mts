// End-to-end HTTP checks against a running DP Data Sub instance.
//
//   DATABASE_URL=... NODE_OPTIONS=--conditions=react-server npx tsx scripts/http-e2e.mts
//
// Exercises registration, login, password reset, auth guards, the order gate,
// payment gating and ownership. Creates and removes its own test accounts.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../src/lib/db.ts";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const tag = randomUUID().slice(0, 6);
const emailA = `e2e-a-${tag}@example.invalid`;
const emailB = `e2e-b-${tag}@example.invalid`;
// Unique per run: phone numbers are unique-constrained in the database.
const phoneA = `0803${String(Math.floor(1_000_000 + Math.random() * 8_999_999)).slice(0, 7)}`;
const phoneB = `0805${String(Math.floor(1_000_000 + Math.random() * 8_999_999)).slice(0, 7)}`;
const password = "TestPass123";
const newPassword = "TestPass456";

let passed = 0;
const failures: string[] = [];

function ok(name: string, detail?: string) {
  passed += 1;
  console.log(`  ok  ${name}${detail ? ` (${detail})` : ""}`);
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((value) => value.split(";")[0]).join("; ");
}

let ipCounter = 0;
/** Distinct simulated client IPs keep per-IP throttles from masking other results. */
function nextIp() {
  ipCounter += 1;
  return `10.20.${Math.floor(Math.random() * 250)}.${ipCounter % 250}`;
}

async function post(path: string, body: unknown, cookie = "", ip = nextIp()) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload, cookie: cookieFrom(response) };
}

async function get(path: string, cookie = "") {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "x-forwarded-for": nextIp(), ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function cleanup(scope: "run" | "all" = "run") {
  const users = await prisma.user.findMany({
    where: {
      email:
        scope === "all"
          ? { startsWith: "e2e-" }
          : { in: [emailA, emailB] },
    },
    select: { id: true },
  });
  for (const user of users) {
    await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.paymentAttempt.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.vtuOrder.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.referral.deleteMany({
      where: { OR: [{ refereeId: user.id }, { referrerId: user.id }] },
    }).catch(() => undefined);
    await prisma.auditEvent.deleteMany({ where: { actorId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}

async function main() {
  let cookieA = "";
  let cookieB = "";
  let referralCode = "";
  let resetToken = "";

  await cleanup("all");

  await check("health reports a reachable database", async () => {
    const response = await fetch(`${BASE}/api/health`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.database, "up");
  });

  await check("registration rejects an invalid Nigerian phone number", async () => {
    const result = await post("/api/auth/register", {
      fullName: "Test User",
      email: `e2e-bad-${tag}@example.invalid`,
      phone: "12345",
      password,
      confirmPassword: password,
    });
    assert.equal(result.status, 400);
    assert.match(String(result.payload.error), /phone|number/i);
  });

  await check("registration rejects a weak password", async () => {
    const result = await post("/api/auth/register", {
      fullName: "Test User",
      email: `e2e-weak-${tag}@example.invalid`,
      phone: "08031234567",
      password: "short",
      confirmPassword: "short",
    });
    assert.equal(result.status, 400);
    assert.match(String(result.payload.error), /password/i);
  });

  await check("registration rejects mismatched passwords", async () => {
    const result = await post("/api/auth/register", {
      fullName: "Test User",
      email: `e2e-mis-${tag}@example.invalid`,
      phone: "08031234567",
      password,
      confirmPassword: "Different1",
    });
    assert.equal(result.status, 400);
    assert.match(String(result.payload.error), /match/i);
  });

  await check("registration creates the account, wallet and session", async () => {
    const result = await post("/api/auth/register", {
      fullName: "Ada Okafor",
      email: emailA,
      phone: phoneA,
      password,
      confirmPassword: password,
    });
    assert.equal(result.status, 201, JSON.stringify(result.payload));
    assert.ok(result.cookie.includes("dpds_session"));
    cookieA = result.cookie;

    const user = await prisma.user.findUnique({
      where: { email: emailA },
      include: { wallet: true },
    });
    assert.ok(user);
    assert.equal(user!.wallet?.balanceKobo, 0);
    assert.equal(user!.role, "USER");
    assert.notEqual(user!.passwordHash, password, "password must not be stored in plain text");
    assert.ok(user!.passwordHash.startsWith("$2"), "expected a bcrypt hash");
    referralCode = user!.referralCode;
  });

  await check("duplicate email is rejected without leaking internals", async () => {
    const result = await post("/api/auth/register", {
      fullName: "Ada Okafor",
      email: emailA,
      phone: phoneB,
      password,
      confirmPassword: password,
    });
    assert.equal(result.status, 409);
    assert.equal(result.payload.code, "EMAIL_TAKEN");
  });

  await check("login with a wrong password returns the generic error", async () => {
    const result = await post("/api/auth/login", { email: emailA, password: "WrongPass123" });
    assert.equal(result.status, 401);
    assert.match(String(result.payload.error), /incorrect/i);
  });

  await check("login succeeds with the correct password", async () => {
    const result = await post("/api/auth/login", { email: emailA, password });
    assert.equal(result.status, 200);
    assert.equal(result.payload.user.email, emailA);
    cookieA = result.cookie || cookieA;
  });

  await check("unknown email returns the same generic login error", async () => {
    const result = await post("/api/auth/login", {
      email: `nobody-${tag}@example.invalid`,
      password,
    });
    assert.equal(result.status, 401);
    assert.match(String(result.payload.error), /incorrect/i);
  });

  await check("password reset issues a single-use token link", async () => {
    const result = await post("/api/auth/forgot-password", { email: emailA });
    assert.equal(result.status, 200);
    // No email provider is configured in this environment, so the dev link is returned.
    assert.equal(result.payload.delivery, "unavailable");
    assert.ok(
      typeof result.payload.devResetUrl === "string",
      "expected a development reset link when email delivery is unavailable",
    );
    const url = new URL(result.payload.devResetUrl);
    resetToken = url.searchParams.get("token") ?? "";
    assert.ok(resetToken.length > 20);
  });

  await check("password reset changes the password and kills old sessions", async () => {
    const result = await post("/api/auth/reset-password", {
      token: resetToken,
      password: newPassword,
      confirmPassword: newPassword,
    });
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    cookieA = result.cookie || cookieA;
    const replay = await post("/api/auth/reset-password", {
      token: resetToken,
      password: newPassword,
      confirmPassword: newPassword,
    });
    assert.equal(replay.status, 400, "a reset token must not be reusable");
  });

  await check("the old password no longer works and the new one does", async () => {
    const oldLogin = await post("/api/auth/login", { email: emailA, password });
    assert.equal(oldLogin.status, 401);
    const newLogin = await post("/api/auth/login", { email: emailA, password: newPassword });
    assert.equal(newLogin.status, 200);
    cookieA = newLogin.cookie || cookieA;
  });

  await check("referral signup records the referral relationship", async () => {
    const result = await post("/api/auth/register", {
      fullName: "Bola Adeyemi",
      email: emailB,
      phone: phoneB,
      password,
      confirmPassword: password,
      referralCode,
    });
    assert.equal(result.status, 201, JSON.stringify(result.payload));
    cookieB = result.cookie;
    const referral = await prisma.referral.findFirst({
      where: { code: referralCode, referee: { email: emailB } },
    });
    assert.ok(referral, "expected a referral row");
    assert.equal(referral!.qualifiedAt, null);
  });

  await check("order endpoint requires a session", async () => {
    const result = await post("/api/orders/data", {
      network: "MTN",
      dataType: "SME",
      planCode: "REF-MTN-SME-1GB-7D",
      phone: "08031234567",
      idempotencyKey: `noauth-${tag}`,
    });
    assert.equal(result.status, 401);
  });

  await check("order rejects an unsupported network", async () => {
    const result = await post(
      "/api/orders/data",
      {
        network: "SMILE",
        dataType: "SME",
        planCode: "REF-MTN-SME-1GB-7D",
        phone: "08031234567",
        idempotencyKey: `net-${tag}`,
      },
      cookieA,
    );
    assert.equal(result.status, 400);
  });

  await check("reference plans cannot be purchased and nothing is debited", async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: emailA },
      select: { id: true },
    });
    const before = await prisma.ledgerEntry.count({ where: { userId: owner.id } });
    const result = await post(
      "/api/orders/data",
      {
        network: "MTN",
        dataType: "SME",
        planCode: "REF-MTN-SME-1GB-7D",
        phone: "08031234567",
        idempotencyKey: `ref-plan-${tag}`,
      },
      cookieA,
    );
    assert.equal(result.status, 409, JSON.stringify(result.payload));
    assert.equal(result.payload.code, "PLAN_NOT_LIVE");
    const after = await prisma.ledgerEntry.count({ where: { userId: owner.id } });
    const orders = await prisma.vtuOrder.count({ where: { userId: owner.id } });
    assert.equal(after, before, "no ledger entry may be written");
    assert.equal(orders, 0, "no order row may be created");
  });

  await check("wallet funding is refused while Paystack is unconfigured", async () => {
    const result = await post("/api/wallet/fund", { amountKobo: 100_000 }, cookieA);
    assert.equal(result.status, 503);
    assert.equal(result.payload.code, "PAYMENTS_NOT_CONFIGURED");
    const attempts = await prisma.paymentAttempt.count({ where: { user: { email: emailA } } });
    assert.equal(attempts, 0);
  });

  await check("payment verification is refused while Paystack is unconfigured", async () => {
    const result = await post(
      "/api/payments/verify",
      { reference: "DPF-FAKE-REFERENCE" },
      cookieA,
    );
    assert.equal(result.status, 503);
  });

  await check("paystack webhook refuses events while unconfigured (no credit path)", async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: emailA },
      select: { id: true },
    });
    const before = await prisma.ledgerEntry.count({ where: { userId: owner.id } });
    const response = await fetch(`${BASE}/api/payments/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": "deadbeef" },
      body: JSON.stringify({
        event: "charge.success",
        data: { reference: `DPF-FAKE-${tag}`, amount: 100_000, status: "success" },
      }),
    });
    assert.equal(response.status, 503);
    const after = await prisma.ledgerEntry.count({ where: { userId: owner.id } });
    assert.equal(after, before, "an unverifiable webhook must never credit a wallet");
  });

  await check("order reconciliation refuses a foreign order", async () => {
    const result = await post("/api/orders/reconcile", { orderId: "not-my-order" }, cookieB);
    assert.equal(result.status, 400);
  });

  await check("signed-in pages render the wallet and transactions", async () => {
    const home = await get("/", cookieA);
    assert.equal(home.status, 200);
    assert.match(home.text, /Ada|Wallet balance/i);
    const transactions = await get("/transactions", cookieA);
    assert.equal(transactions.status, 200);
    assert.match(transactions.text, /Transactions/i);
  });

  await check("a normal user cannot see the admin dashboard", async () => {
    const admin = await get("/admin", cookieA);
    assert.doesNotMatch(admin.text, /Pending orders|Audit trail/i);
  });

  await check("registration is throttled per client IP", async () => {
    const ip = "10.99.99.99";
    const statuses: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const result = await post(
        "/api/auth/register",
        {
          fullName: "Rate Limit",
          email: `e2e-rl-${tag}-${index}@example.invalid`,
          phone: "12345",
          password,
          confirmPassword: password,
        },
        "",
        ip,
      );
      statuses.push(result.status);
    }
    assert.equal(statuses[statuses.length - 1], 429, `statuses: ${statuses.join(",")}`);
  });

  await check("logout revokes the current session", async () => {
    const sessionsBefore = await prisma.session.count({
      where: { user: { email: emailA }, revokedAt: null },
    });
    assert.ok(sessionsBefore >= 1, "expected at least one live session");
    const result = await post("/api/auth/logout", {}, cookieA);
    assert.equal(result.status, 200);
    const sessionsAfter = await prisma.session.count({
      where: { user: { email: emailA }, revokedAt: null },
    });
    assert.equal(sessionsAfter, sessionsBefore - 1, "logout must revoke the session it was called with");
    const guarded = await post(
      "/api/wallet/fund",
      { amountKobo: 100_000 },
      cookieA,
    );
    assert.equal(guarded.status, 401, "a revoked cookie must no longer authenticate");
  });

  await check("an unauthenticated order stays rejected after logout", async () => {
    const result = await post(
      "/api/orders/data",
      {
        network: "MTN",
        dataType: "SME",
        planCode: "REF-MTN-SME-1GB-7D",
        phone: "08031234567",
        idempotencyKey: `post-logout-${tag}`,
      },
      cookieA,
    );
    assert.equal(result.status, 401);
  });
}

main()
  .catch((error) => {
    failures.push(`harness crashed: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Harness error:", error);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n${passed} checks passed, ${failures.length} failed.`);
    if (failures.length > 0) {
      for (const failure of failures) console.log(` - ${failure}`);
      process.exitCode = 1;
    }
  });
