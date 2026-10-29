"use client";
import React from 'react';

import { useState } from "react";
import { MailWarning } from "lucide-react";

export function VerifyEmailBanner() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setState("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email", { method: "PUT" });
      const payload = await response.json();
      if (!response.ok) {
        setState("error");
        setMessage(payload.error ?? "We could not send that email.");
        return;
      }
      setState("sent");
      setDevUrl(payload.devVerificationUrl ?? null);
      setMessage(
        payload.delivered
          ? "Verification email sent. Check your inbox."
          : payload.reason ?? "Email delivery is not configured yet.",
      );
    } catch {
      setState("error");
      setMessage("Network problem. Please try again.");
    }
  }

  return (
    <div className="mb-4 rounded-[16px] border border-[#F3E2C0] bg-[#FBF6EA] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-[#8A5B12]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#6B4A10]">Confirm your email address</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#7A5A22]">
            We could not confirm delivery of your verification email. You can keep using your wallet, but
            verify before contacting support about your account.
          </p>
          {message && <p className="mt-1.5 text-[11.5px] font-medium text-[#6B4A10]">{message}</p>}
          {devUrl && (
            <a
              href={devUrl}
              className="mt-1.5 inline-block break-all text-[11.5px] font-semibold text-brand underline"
            >
              Open your verification link
            </a>
          )}
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending"}
            className="mt-2 inline-flex h-8 items-center rounded-lg border border-[#E3CFA5] bg-white px-3 text-[11.5px] font-semibold text-[#6B4A10] disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Resend verification email"}
          </button>
        </div>
      </div>
    </div>
  );
}
