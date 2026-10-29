import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { badRequest, ok, readBody, serverError, tooManyRequests } from "@/lib/api";
import {
  clientIpFrom,
  createSession,
  hashPassword,
  hashToken,
  rateLimit,
  sessionCookieOptions,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { passwordProblem } from "@/lib/validation";

type Body = { token?: string; password?: string; confirmPassword?: string };

export async function POST(request: Request) {
  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`reset:${ip}`, 8, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  const token = (body?.token || "").trim();
  const password = body?.password || "";

  if (!token) return badRequest("This reset link is missing its token. Request a new link.");
  const passError = passwordProblem(password);
  if (passError) return badRequest(passError, { password: passError });
  if (password !== body?.confirmPassword) {
    return badRequest("Passwords do not match.", { confirmPassword: "Passwords do not match." });
  }

  try {
    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true } } },
    });

    if (!record || record.purpose !== "PASSWORD_RESET") {
      return badRequest("This reset link is invalid. Request a new one.");
    }
    if (record.usedAt) {
      return badRequest("This reset link has already been used. Request a new one.");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return badRequest("This reset link has expired. Request a new one.");
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Password change invalidates every other session.
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditEvent.create({
        data: {
          actorId: record.userId,
          action: "auth.password_reset_completed",
          entity: "User",
          entityId: record.userId,
          ip,
        },
      }),
    ]);

    const session = await createSession(record.userId);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({ ...sessionCookieOptions(session.expiresAt), value: session.token });
    return response;
  } catch (error) {
    console.error("[reset-password]", error instanceof Error ? error.message : error);
    return serverError("We could not reset your password. Please try again.");
  }
}

export async function GET() {
  return ok({ message: "Submit a new password with POST." });
}
