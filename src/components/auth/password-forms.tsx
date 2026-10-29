"use client";
import React from 'react';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setNote(null);
    setDevUrl(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "We could not start the reset.");
        return;
      }
      setMessage(payload.message ?? "Check your inbox for the reset link.");
      if (payload.delivery === "unavailable") {
        setNote(
          payload.deliveryNote ??
            "Email delivery is not configured, so the reset email could not be sent.",
        );
      }
      if (payload.devResetUrl) setDevUrl(payload.devResetUrl);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[12.5px] font-medium text-[#A32B22]">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="app-input"
          placeholder="you@example.com"
        />
        <p className="field-hint">
          We will send a single-use link that expires in 60 minutes. If email delivery is not configured,
          we say so instead of pretending the message went out.
        </p>
      </div>

      <button type="submit" disabled={busy} className="btn-brand w-full" aria-busy={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? "Sending…" : "Send reset link"}
      </button>

      {message && (
        <div className="rounded-xl border border-[#C9EBD9] bg-[#EAF7F0] px-3.5 py-2.5">
          <p className="text-[12.5px] font-medium text-[#0B7A45]">{message}</p>
          {note && <p className="mt-1 text-[11.5px] text-[#6B4A10]">{note}</p>}
          {devUrl && (
            <Link href={devUrl} className="mt-1.5 inline-block break-all text-[11.5px] font-semibold text-brand underline">
              Open reset link
            </Link>
          )}
        </div>
      )}
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "We could not reset your password.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[#C9EBD9] bg-[#EAF7F0] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#0B7A45]">Password updated</p>
          <p className="mt-1 text-[12px] text-[#0B5A38]">
            You are signed in on this device. Other devices were signed out for your safety.
          </p>
        </div>
        <Link href="/" className="btn-brand w-full">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[12.5px] font-medium text-[#A32B22]">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="password" className="field-label">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="app-input"
          placeholder="At least 8 characters"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="field-label">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="app-input"
          placeholder="Repeat new password"
        />
      </div>
      <button type="submit" disabled={busy} className="btn-brand w-full" aria-busy={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
