import { headers } from "next/headers";

import { badRequest, forbidden, ok, readBody, serverError, tooManyRequests } from "@/lib/api";
import { clientIpFrom, getCurrentUser, rateLimit } from "@/lib/auth";
import {
  clearPaystackSettings,
  loadPaymentGatewayStatus,
  savePaystackSettings,
  validateSavedPaystackConnection,
} from "@/lib/payment-gateway";

export const dynamic = "force-dynamic";

type Body = {
  action?: "save" | "validate" | "clear";
  secretKey?: string;
  publicKey?: string;
  webhookSecret?: string;
  mode?: string;
  enableLive?: boolean;
  verify?: boolean;
};

/**
 * Payment gateway configuration.
 *
 * Administrator-only. The response is always the sanitised status object —
 * booleans, key families and validation text. Submitted secrets are encrypted
 * immediately and never echoed back, never logged and never written to the audit
 * trail.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return forbidden("Administrator access only.");
  if (admin.role !== "ADMIN") return forbidden("Administrator access only.");

  const headerList = await headers();
  const ip = clientIpFrom(headerList);
  if (!rateLimit(`payment-gateway:${admin.id}`, 20, 60_000)) return tooManyRequests();

  const body = await readBody<Body>(request);
  if (!body?.action) return badRequest("Action is required.");

  try {
    if (body.action === "save") {
      const result = await savePaystackSettings(
        {
          secretKey: body.secretKey,
          publicKey: body.publicKey,
          webhookSecret: body.webhookSecret,
          mode: body.mode,
          enableLive: body.enableLive === true,
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

    if (body.action === "validate") {
      const validation = await validateSavedPaystackConnection(
        { id: admin.id, email: admin.email },
        ip,
      );
      return ok({ validation, status: await loadPaymentGatewayStatus() });
    }

    if (body.action === "clear") {
      const status = await clearPaystackSettings({ id: admin.id, email: admin.email }, ip);
      return ok({
        message:
          "Saved credentials were removed and the gateway is back in test mode. Environment variables, if any, still apply.",
        status,
      });
    }

    return badRequest("Unsupported action.");
  } catch (error) {
    // Message only — never the payload, which can contain a secret key.
    console.error(
      "[admin/payment-gateway]",
      error instanceof Error ? error.message : "unknown error",
    );
    return serverError("The gateway configuration could not be saved. Nothing was changed.");
  }
}
