"use client";
import React from 'react';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type FieldErrors = Record<string, string>;

export function RegisterForm({ initialReferral = "" }: { initialReferral?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    referralCode: initialReferral,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "We could not create your account.");
        if (payload.details && typeof payload.details === "object") {
          setFieldErrors(payload.details as FieldErrors);
        }
        return;
      }
      if (payload.emailDelivery && !payload.emailDelivery.delivered) {
        setDeliveryNote(payload.emailDelivery.reason ?? "Verification email was not delivered.");
        setDevUrl(payload.devVerificationUrl ?? null);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (deliveryNote) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#F3E2C0] bg-[#FBF6EA] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#6B4A10]">Your account is ready</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#7A5A22]">
            We could not deliver the verification email: {deliveryNote} You can continue — the banner on
            your dashboard lets you resend it once email delivery is configured.
          </p>
          {devUrl && (
            <a href={devUrl} className="mt-1.5 inline-block break-all text-[11.5px] font-semibold text-brand underline">
              Open your verification link
            </a>
          )}
        </div>
        <a href="/" className="btn-brand w-full">
          Continue to dashboard
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[12.5px] font-medium text-[#A32B22]"
        >
          {error}
        </p>
      )}

      <div>
        <label htmlFor="fullName" className="field-label">
          Full name
        </label>
        <input
          id="fullName"
          autoComplete="name"
          required
          value={form.fullName}
          onChange={(event) => update("fullName", event.target.value)}
          className="app-input"
          placeholder="Ada Okafor"
          aria-invalid={Boolean(fieldErrors.fullName)}
        />
        <p className="field-hint">This is the name that appears on your receipts.</p>
      </div>

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
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          className="app-input"
          placeholder="you@example.com"
          aria-invalid={Boolean(fieldErrors.email)}
        />
      </div>

      <div>
        <label htmlFor="phone" className="field-label">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={form.phone}
          onChange={(event) => update("phone", event.target.value)}
          className="app-input"
          placeholder="08031234567"
          aria-invalid={Boolean(fieldErrors.phone)}
        />
        <p className="field-hint">Nigerian numbers only. Used for your account and receipts.</p>
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            className="app-input pr-11"
            placeholder="At least 8 characters"
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-muted hover:bg-secondary"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="field-hint">Use at least 8 characters, including a letter and a number.</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="field-label">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={(event) => update("confirmPassword", event.target.value)}
          className="app-input"
          placeholder="Repeat your password"
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
        />
      </div>

      <div>
        <label htmlFor="referralCode" className="field-label">
          Referral code <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id="referralCode"
          value={form.referralCode}
          onChange={(event) => update("referralCode", event.target.value.toUpperCase())}
          className="app-input uppercase tracking-[0.08em]"
          placeholder="e.g. ADAB2C9F"
        />
      </div>

      <button type="submit" disabled={busy} className="btn-brand w-full" aria-busy={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-[11.5px] leading-relaxed text-ink-muted">
        By creating an account you agree to our{" "}
        <a href="/terms" className="font-medium text-brand underline">
          terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="font-medium text-brand underline">
          privacy notice
        </a>
        .
      </p>
    </form>
  );
}
