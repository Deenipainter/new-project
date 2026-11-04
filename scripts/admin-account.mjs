#!/usr/bin/env node
/**
 * Administrator account recovery / setup.
 *
 * Use this when nobody can sign in as an administrator, so the in-app
 * "Profile → Login email / Change password" screens are out of reach.
 *
 * Values are read from the environment (or the project .env), never from the
 * command line, so a password never lands in shell history, a chat message or a
 * terminal log. Nothing secret is ever printed: only the resulting email, role
 * and whether a password was replaced.
 *
 *   ADMIN_LOGIN_EMAIL=owner@example.com node scripts/admin-account.mjs
 *   ADMIN_LOGIN_EMAIL=owner@example.com ADMIN_LOGIN_PASSWORD='…' node scripts/admin-account.mjs
 *   ADMIN_LOGIN_EMAIL=old@example.com ADMIN_LOGIN_NEW_EMAIL=new@example.com ADMIN_LOGIN_PASSWORD='…' \
 *     node scripts/admin-account.mjs
 *
 * Optional, only when the account does not exist yet and must be created:
 *   ADMIN_LOGIN_NAME='Owner Name' ADMIN_LOGIN_PHONE=08030000000
 */
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/** Minimal .env reader — the runtime env always wins over the file. */
function loadEnvFile() {
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function localPhone(input) {
  const digits = String(input || "").replace(/[^\d+]/g, "");
  let local = digits;
  if (local.startsWith("+234")) local = local.slice(4);
  else if (local.startsWith("234")) local = local.slice(3);
  else if (local.startsWith("0")) local = local.slice(1);
  return /^[789]\d{9}$/.test(local) ? `0${local}` : null;
}

function passwordProblem(password) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/\d/.test(password)) return "Password must include at least one number.";
  return null;
}

function referralCode() {
  return `ADMN${randomBytes(3).toString("hex").toUpperCase()}`;
}

loadEnvFile();

const selectorEmail = (process.env.ADMIN_LOGIN_EMAIL || "").trim().toLowerCase();
const renamedEmail = (process.env.ADMIN_LOGIN_NEW_EMAIL || "").trim().toLowerCase();
const targetEmail = renamedEmail || selectorEmail;
const newPassword = process.env.ADMIN_LOGIN_PASSWORD || "";
const fullName = (process.env.ADMIN_LOGIN_NAME || "").trim();
const phone = localPhone(process.env.ADMIN_LOGIN_PHONE);

if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set in the environment or .env.");
if (targetEmail && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(targetEmail)) fail("That is not a valid email address.");

if (newPassword) {
  const problem = passwordProblem(newPassword);
  if (problem) fail(problem);
}

const prisma = new PrismaClient();

try {
  // The selector is the account as it exists today; the target is where it should end up.
  let user = selectorEmail ? await prisma.user.findUnique({ where: { email: selectorEmail } }) : null;

  // Without an email, recover the oldest administrator account.
  if (!user && !selectorEmail) {
    user = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  }

  if (!user) {
    if (!targetEmail) fail("No administrator account found. Set ADMIN_LOGIN_EMAIL to the address to use.");
    if (!fullName) fail("That account does not exist. Set ADMIN_LOGIN_NAME to create it.");
    if (!phone) fail("That account does not exist. Set ADMIN_LOGIN_PHONE (e.g. 08030000000) to create it.");
    if (!newPassword) fail("Creating an account needs ADMIN_LOGIN_PASSWORD.");
    if (await prisma.user.findFirst({ where: { phone } })) fail("That phone number is already used by another account.");

    const created = await prisma.user.create({
      data: {
        email: targetEmail,
        fullName,
        phone,
        passwordHash: await bcrypt.hash(newPassword, 10),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
        referralCode: referralCode(),
      },
      select: { email: true, role: true },
    });
    console.log(`✔ Created administrator ${created.email} (role ${created.role}).`);
    console.log("  Password: set from ADMIN_LOGIN_PASSWORD (bcrypt hash stored, value not printed).");
  } else {
    const data = {};

    if (targetEmail && targetEmail !== user.email) {
      const taken = await prisma.user.findFirst({
        where: { email: targetEmail, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) fail("That email is already used by another account.");
      data.email = targetEmail;
    }

    if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 10);
    if (user.role !== "ADMIN") data.role = "ADMIN";

    if (Object.keys(data).length === 0) {
      console.log(`• Nothing to change. ${user.email} is already an administrator.`);
    } else {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data,
        select: { email: true, role: true },
      });
      // Recovery implies the owner is back in control of the address.
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      console.log(`✔ Updated administrator ${updated.email} (role ${updated.role}).`);
      if (data.email) console.log(`  Login email: ${user.email} → ${updated.email}`);
      console.log(
        `  Password: ${newPassword ? "replaced (bcrypt hash stored, value not printed)" : "unchanged"}`,
      );
    }
  }

  console.log("  Next step: sign in, then remove ADMIN_LOGIN_PASSWORD from .env so it is not kept around.");
} finally {
  await prisma.$disconnect();
}
