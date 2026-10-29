import { headers } from "next/headers";

import { ok, readBody, serverError, tooManyRequests } from "@/lib/api";
import { clientIpFrom, hashToken, randomToken, rateLimit } from "@/lib/auth";
import { devLinksEnabled } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { isEmail, normalizeEmail } from "@/lib/validation";

type Body = { email?: string };

const RESET_TTL_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`forgot:${ip}`, 5, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  const email = normalizeEmail(body?.email || "");

  // Always answer the same way; never reveal whether an account exists.
  const generic = {
    message: "If that email belongs to a DP Data Sub account, a reset link is on its way.",
    delivery: "unknown" as const,
  };

  if (!isEmail(email)) return ok(generic);

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, fullName: true } });
    if (!user) return ok(generic);

    // Invalidate outstanding tokens, then issue one single-use token.
    await prisma.authToken.updateMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomToken();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const origin =
      request.headers.get("origin") ||
      (process.env.NEXT_PUBLIC_APP_URL ?? "").trim() ||
      `https://${headerList.get("host") ?? "localhost:3000"}`;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    const delivery = await sendPasswordResetEmail(email, user.fullName, resetUrl);

    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        action: "auth.password_reset_requested",
        entity: "User",
        entityId: user.id,
        ip,
        metadata: { delivered: delivery.delivered },
      },
    });

    return ok({
      ...generic,
      delivery: delivery.delivered ? "sent" : "unavailable",
      deliveryNote: delivery.delivered ? null : delivery.reason,
      devResetUrl: !delivery.delivered && devLinksEnabled() ? resetUrl : undefined,
    });
  } catch (error) {
    console.error("[forgot-password]", error instanceof Error ? error.message : error);
    return serverError("We could not start the reset right now. Please try again.");
  }
}
