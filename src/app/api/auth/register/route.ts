import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { badRequest, conflict, ok, readBody, serverError, tooManyRequests } from "@/lib/api";
import {
  createSession,
  generateReferralCode,
  hashPassword,
  hashToken,
  isAdminEmail,
  randomToken,
  rateLimit,
  sessionCookieOptions,
  clientIpFrom,
} from "@/lib/auth";
import { devLinksEnabled } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { isEmail, nameProblem, normalizeEmail, normalizePhone, passwordProblem } from "@/lib/validation";

type Body = {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  referralCode?: string;
};

export async function POST(request: Request) {
  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`register:${ip}`, 6, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  if (!body) return badRequest("Send your details as JSON.");

  const fullName = (body.fullName || "").trim();
  const email = normalizeEmail(body.email || "");
  const phone = normalizePhone(body.phone || "");
  const password = body.password || "";

  const nameError = nameProblem(fullName);
  if (nameError) return badRequest(nameError, { fullName: nameError });
  if (!isEmail(email)) return badRequest("Enter a valid email address.", { email: "Invalid email." });
  if (!phone) {
    return badRequest("Enter a valid Nigerian mobile number, e.g. 08031234567.", {
      phone: "Invalid Nigerian number.",
    });
  }
  const passError = passwordProblem(password);
  if (passError) return badRequest(passError, { password: passError });
  if (password !== body.confirmPassword) {
    return badRequest("Passwords do not match.", { confirmPassword: "Passwords do not match." });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { email: true, phone: true },
    });
    if (existing) {
      if (existing.email === email) {
        return conflict("An account with this email already exists. Try signing in.", "EMAIL_TAKEN");
      }
      return conflict("This phone number is already registered.", "PHONE_TAKEN");
    }

    const referrer = body.referralCode
      ? await prisma.user.findUnique({
          where: { referralCode: body.referralCode.trim().toUpperCase() },
          select: { id: true, referralCode: true },
        })
      : null;

    const passwordHash = await hashPassword(password);

    let referralCode = generateReferralCode(fullName);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clash = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
      if (!clash) break;
      referralCode = generateReferralCode(fullName);
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName,
          email,
          phone,
          passwordHash,
          referralCode,
          role: isAdminEmail(email) ? "ADMIN" : "USER",
          referredById: referrer?.id ?? null,
          wallet: { create: { balanceKobo: 0 } },
        },
        select: { id: true, fullName: true, email: true, role: true, referralCode: true },
      });

      if (referrer?.id) {
        await tx.referral.create({
          // The code recorded is the one that was used to join (the referrer's),
          // not the referee's own newly generated code.
          data: { referrerId: referrer.id, refereeId: created.id, code: referrer.referralCode },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: created.id,
          actorRole: created.role,
          action: "auth.register",
          entity: "User",
          entityId: created.id,
          ip,
          metadata: { referredBy: referrer?.id ?? null },
        },
      });

      return created;
    });

    // Email verification token (single use, 24h).
    const verificationToken = randomToken();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(verificationToken),
        purpose: "EMAIL_VERIFICATION",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const origin = request.headers.get("origin") || `https://${headerList.get("host") ?? "localhost:3000"}`;
    const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;
    const emailResult = await sendVerificationEmail(email, fullName, verifyUrl);

    const session = await createSession(user.id);
    const response = NextResponse.json(
      {
        user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
        emailDelivery: {
          delivered: emailResult.delivered,
          reason: emailResult.reason ?? null,
        },
        devVerificationUrl: !emailResult.delivered && devLinksEnabled() ? verifyUrl : undefined,
      },
      { status: 201 },
    );
    response.cookies.set({ ...sessionCookieOptions(session.expiresAt), value: session.token });
    return response;
  } catch (error) {
    console.error("[register] failed", error instanceof Error ? error.message : error);
    return serverError("We could not create your account just now. Please try again.");
  }
}
