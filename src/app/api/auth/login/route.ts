import { NextResponse } from "next/server";

import { badRequest, ok, readBody, serverError, tooManyRequests, unauthorized } from "@/lib/api";
import {
  clientIpFrom,
  createSession,
  rateLimit,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/validation";
import { headers } from "next/headers";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`login:${ip}`, 10, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  const email = normalizeEmail(body?.email || "");
  const password = body?.password || "";

  if (!email || !password) return badRequest("Enter your email and password.");

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: { select: { balanceKobo: true } } },
    });

    // Same message for unknown email and wrong password — no account enumeration.
    const genericError = "Email or password is incorrect.";
    if (!user) return unauthorized(genericError);

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await prisma.auditEvent.create({
        data: {
          actorId: user.id,
          actorRole: user.role,
          action: "auth.login_failed",
          entity: "User",
          entityId: user.id,
          ip,
        },
      });
      return unauthorized(genericError);
    }

    const session = await createSession(user.id);
    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        action: "auth.login",
        entity: "User",
        entityId: user.id,
        ip,
      },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        balanceKobo: user.wallet?.balanceKobo ?? 0,
      },
      emailVerified: Boolean(user.emailVerifiedAt),
    });
    response.cookies.set({ ...sessionCookieOptions(session.expiresAt), value: session.token });
    return response;
  } catch (error) {
    console.error("[login] failed", error instanceof Error ? error.message : error);
    return serverError("Sign in is temporarily unavailable. Please try again.");
  }
}

export async function GET() {
  return ok({ error: "Use POST to sign in." });
}
