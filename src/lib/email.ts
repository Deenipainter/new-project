import "server-only";

import { resendConfig, APP_NAME } from "@/lib/config";
import { fetchWithTimeout, readJsonSafe } from "@/lib/http";

export type EmailResult = { delivered: boolean; id?: string; reason?: string };

type SendArgs = { to: string; subject: string; html: string; text: string };

/** Sends through Resend when configured; never throws, never fakes delivery. */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<EmailResult> {
  const cfg = resendConfig();
  if (!cfg.configured) {
    console.warn("[email] RESEND_API_KEY is not configured — message not sent:", subject);
    return { delivered: false, reason: "Email delivery is not configured (RESEND_API_KEY missing)." };
  }

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      timeoutMs: 15000,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, html, text }),
    });
    const payload = (await readJsonSafe(response)) as { id?: string; message?: string } | null;
    if (!response.ok) {
      return {
        delivered: false,
        reason: payload?.message || `Resend rejected the message (HTTP ${response.status}).`,
      };
    }
    return { delivered: true, id: payload?.id };
  } catch (error) {
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : "Email request failed.",
    };
  }
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  return `
  <div style="background:#F5F7F6;padding:32px 16px;font-family:ui-sans-serif,system-ui,Segoe UI,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden">
      <div style="background:#087F5B;padding:20px 24px;color:#FFFFFF">
        <div style="font-size:18px;font-weight:700">${APP_NAME}</div>
        <div style="font-size:12px;opacity:.85">Your Data, Your Way.</div>
      </div>
      <div style="padding:24px;color:#17211D">
        <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
        <div style="font-size:14px;line-height:1.6;color:#374151">${body}</div>
        ${
          cta
            ? `<div style="margin-top:24px"><a href="${cta.url}" style="display:inline-block;background:#087F5B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${cta.label}</a></div>
               <p style="font-size:12px;color:#6B7280;margin-top:16px;word-break:break-all">${cta.url}</p>`
            : ""
        }
      </div>
      <div style="padding:16px 24px;border-top:1px solid #E5E7EB;font-size:11px;color:#6B7280">
        If you did not request this message you can safely ignore it.
      </div>
    </div>
  </div>`;
}

export async function sendVerificationEmail(to: string, name: string, url: string) {
  return sendEmail({
    to,
    subject: `Verify your ${APP_NAME} email`,
    text: `Hi ${name}, verify your ${APP_NAME} email: ${url}`,
    html: layout(
      "Confirm your email address",
      `Hi ${name}, welcome to ${APP_NAME}. Confirm your email to secure your account. This link expires in 24 hours.`,
      { label: "Verify email", url },
    ),
  });
}

export async function sendPasswordResetEmail(to: string, name: string, url: string) {
  return sendEmail({
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: `Hi ${name}, reset your ${APP_NAME} password: ${url}`,
    html: layout(
      "Reset your password",
      `Hi ${name}, we received a request to reset your password. This link can be used once and expires in 60 minutes.`,
      { label: "Reset password", url },
    ),
  });
}
