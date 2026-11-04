import { headers } from "next/headers";

import { badRequest, forbidden, ok, readBody, serverError, tooManyRequests } from "@/lib/api";
import { clientIpFrom, getCurrentUser, rateLimit } from "@/lib/auth";
import {
  clearAlrahuzSettings,
  loadAlrahuzStatus,
  saveAlrahuzSettings,
  testAlrahuzConnection,
} from "@/lib/alrahuz-settings";

export const dynamic = "force-dynamic";

type Body = {
  action?: "save" | "test" | "clear";
  apiKey?: string;
  baseUrl?: string;
  authScheme?: string;
  checkPath?: string;
  verify?: boolean;
};

/**
 * Alrahuz API configuration.
 *
 * Administrator-only. The response is always the sanitised status object —
 * booleans, the masked key state and the non-secret connection result. A
 * submitted API key is encrypted immediately and is never echoed back, logged or
 * written to the audit trail.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return forbidden("Administrator access only.");
  if (admin.role !== "ADMIN") return forbidden("Administrator access only.");

  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`alrahuz-settings:${admin.id}`, 20, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  if (!body?.action) return badRequest("Action is required.");

  try {
    if (body.action === "save") {
      const result = await saveAlrahuzSettings(
        {
          apiKey: body.apiKey,
          baseUrl: body.baseUrl,
          authScheme: body.authScheme,
          checkPath: body.checkPath,
          verify: body.verify === true,
        },
        { id: admin.id, email: admin.email },
        ip,
      );

      if (!result.ok) {
        return badRequest(result.error, result.field ? { field: result.field } : undefined);
      }

      return ok({
        message: result.message,
        validation: result.validation,
        status: result.status,
      });
    }

    if (body.action === "test") {
      const validation = await testAlrahuzConnection({ id: admin.id, email: admin.email }, ip);
      return ok({ validation, status: await loadAlrahuzStatus() });
    }

    if (body.action === "clear") {
      const status = await clearAlrahuzSettings({ id: admin.id, email: admin.email }, ip);
      return ok({
        message:
          "Saved Alrahuz credentials were removed. Environment variables, if any, still apply. Existing orders and records are untouched.",
        status,
      });
    }

    return badRequest("Unsupported action.");
  } catch (error) {
    // Message only — never the payload, which can contain the API key.
    console.error("[admin/alrahuz]", error instanceof Error ? error.message : "unknown error");
    return serverError("The Alrahuz configuration could not be saved. Nothing was changed.");
  }
}
