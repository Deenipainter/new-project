import { headers } from "next/headers";

import { badRequest, ok, readBody, serverError } from "@/lib/api";
import { getCurrentUser, hashToken, randomToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { devLinksEnabled } from "@/lib/config";
import { sendVerificationEmail } from "@/lib/email";

type Body = { token?: string };

export async function POST(request: Request) {
  const body = await readBody<Body>(request);
  const token = (body?.token || "").trim();
  if (!token) return badRequest("Verification token missing.");

  try {
    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, emailVerifiedAt: true } } },
    });

    if (!record || record.purpose !== "EMAIL_VERIFICATION") {
      return badRequest("This verification link is invalid.");
    }
    if (record.usedAt) return ok({ message: "This email is already verified." });
    if (record.expiresAt.getTime() < Date.now()) {
      return badRequest("This verification link has expired. Request a new one.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
      }),
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.auditEvent.create({
        data: {
          actorId: record.userId,
          action: "auth.email_verified",
          entity: "User",
          entityId: record.userId,
        },
      }),
    ]);

    return ok({ message: "Email verified. Thank you." });
  } catch (error) {
    console.error("[verify-email]", error instanceof Error ? error.message : error);
    return serverError("Verification failed. Please try again.");
  }
}

/** Re-sends a verification email for the signed-in user. */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Sign in first.");

  const token = randomToken();
  await prisma.authToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: "EMAIL_VERIFICATION",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const headerList = await headers();
  const origin =
    request.headers.get("origin") ||
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim() ||
    `https://${headerList.get("host") ?? "localhost:3000"}`;
  const url = `${origin}/verify-email?token=${token}`;
  const result = await sendVerificationEmail(user.email, user.fullName, url);

  return ok({
    delivered: result.delivered,
    reason: result.reason ?? null,
    devVerificationUrl: !result.delivered && devLinksEnabled() ? url : undefined,
  });
}
