import { badRequest, ok, readBody, serverError, unauthorized } from "@/lib/api";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEmail, nameProblem, normalizeEmail, normalizePhone } from "@/lib/validation";

type Body = { fullName?: string; phone?: string; email?: string; currentPassword?: string };

/**
 * Name, phone and login email are editable. Balance, role and IDs are not.
 * Changing the login email requires the current password, so a hijacked session
 * cannot quietly move an account to another address.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readBody<Body>(request);
  if (!body) return badRequest("Send your changes as JSON.");

  const data: { fullName?: string; phone?: string; email?: string } = {};

  if (typeof body.fullName === "string") {
    const nameError = nameProblem(body.fullName);
    if (nameError) return badRequest(nameError, { fullName: nameError });
    data.fullName = body.fullName.trim();
  }

  if (typeof body.phone === "string") {
    const phone = normalizePhone(body.phone);
    if (!phone) return badRequest("Enter a valid Nigerian mobile number.", { phone: "Invalid number." });
    const taken = await prisma.user.findFirst({
      where: { phone, NOT: { id: user.id } },
      select: { id: true },
    });
    if (taken) return badRequest("That phone number is already used by another account.", { phone: "Already in use." });
    data.phone = phone;
  }

  if (typeof body.email === "string") {
    const email = normalizeEmail(body.email);
    if (email && email !== normalizeEmail(user.email)) {
      if (!isEmail(email)) return badRequest("Enter a valid email address.", { email: "Invalid email." });

      if (!body.currentPassword) {
        return badRequest("Enter your current password to change your login email.", {
          currentPassword: "Required.",
        });
      }

      const record = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      if (!record) return unauthorized();
      if (!(await verifyPassword(body.currentPassword, record.passwordHash))) {
        return badRequest("Your current password is incorrect.", { currentPassword: "Incorrect." });
      }

      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) return badRequest("That email is already used by another account.", { email: "Already in use." });

      data.email = email;
    }
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update.");

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { fullName: true, phone: true, email: true },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        action: "profile.updated",
        entity: "User",
        entityId: user.id,
        metadata: { fields: Object.keys(data) },
      },
    });
    return ok({ profile: updated });
  } catch (error) {
    console.error("[profile]", error instanceof Error ? error.message : error);
    return serverError("We could not save your profile changes.");
  }
}

type PasswordBody = { currentPassword?: string; password?: string; confirmPassword?: string };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readBody<PasswordBody>(request);
  const current = body?.currentPassword || "";
  const next = body?.password || "";

  if (!current || !next) return badRequest("Enter your current and new password.");
  if (next !== body?.confirmPassword) {
    return badRequest("New passwords do not match.", { confirmPassword: "Passwords do not match." });
  }
  if (next.length < 8) return badRequest("Password must be at least 8 characters.");

  try {
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!record) return unauthorized();
    const valid = await verifyPassword(current, record.passwordHash);
    if (!valid) return badRequest("Your current password is incorrect.", { currentPassword: "Incorrect." });

    const passwordHash = await hashPassword(next);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.auditEvent.create({
        data: {
          actorId: user.id,
          actorRole: user.role,
          action: "auth.password_changed",
          entity: "User",
          entityId: user.id,
        },
      }),
    ]);

    return ok({ message: "Password updated. Other devices stay signed in until they expire." });
  } catch (error) {
    console.error("[profile/password]", error instanceof Error ? error.message : error);
    return serverError("We could not change your password.");
  }
}
