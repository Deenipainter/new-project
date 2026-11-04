"use client";
import React from 'react';

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type { GatewayValidationResult, PaymentGatewayStatus } from "@/lib/payment-gateway";
import { cn } from "@/lib/utils";

// Placeholders are hints only — never a real-looking key, and never a stored value.
const TEST_SECRET_PLACEHOLDER = "sk_test_… paste your secret key";
const PUBLIC_KEY_PLACEHOLDER = "pk_test_… paste your public key";
const WEBHOOK_PLACEHOLDER = "whsec_… (your Paystack webhook secret)";

/** Deterministic UTC stamp so server and client render identically. */
function stamp(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

type SecretFieldProps = {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  onToggleReveal: () => void;
  configured: boolean;
  configuredLabel: string;
};

function SecretField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
  revealed,
  onToggleReveal,
  configured,
  configuredLabel,
}: SecretFieldProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
            configured
              ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#0B7A45]"
              : "border-line bg-white text-ink-muted",
          )}
        >
          {configured ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {configured ? configuredLabel : "Not configured"}
        </span>
      </div>

      <div className="relative mt-1.5">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-describedby={`${id}-hint`}
          className="app-input pr-12 font-mono text-[13px]"
        />
        <button
          type="button"
          onClick={onToggleReveal}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={revealed}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-secondary hover:text-ink"
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      <p id={`${id}-hint`} className="field-hint">
        {hint}
      </p>
    </div>
  );
}

export function PaystackSettingsForm({ status }: { status: PaymentGatewayStatus }) {
  const router = useRouter();

  const [secretKey, setSecretKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [revealed, setRevealed] = useState({ secret: false, public: false, webhook: false });
  const [verify, setVerify] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "validate" | "clear">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<GatewayValidationResult | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const secretKindLabel =
    status.secretKey.kind === "live" ? "Live key saved" : status.secretKey.kind === "test" ? "Test key saved" : "Saved";
  const publicKindLabel =
    status.publicKey.kind === "live" ? "Live key saved" : status.publicKey.kind === "test" ? "Test key saved" : "Saved";

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/payment-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; validation?: GatewayValidationResult | null }
      | null;
    if (!response.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "That request failed.");
    }
    return data ?? {};
  }

  async function save() {
    setError(null);
    setMessage(null);
    setValidation(null);
    setBusy("save");
    try {
      const data = await post({
        action: "save",
        mode: "TEST",
        secretKey: secretKey.trim() || undefined,
        publicKey: publicKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        verify,
      });
      setMessage(typeof data.message === "string" ? data.message : "Configuration saved.");
      if (data.validation) setValidation(data.validation);
      // Drop the plaintext from component state as soon as it is stored.
      setSecretKey("");
      setPublicKey("");
      setWebhookSecret("");
      setRevealed({ secret: false, public: false, webhook: false });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The configuration could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    setError(null);
    setMessage(null);
    setBusy("validate");
    try {
      const data = await post({ action: "validate" });
      setValidation(data.validation ?? null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The connection check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    setError(null);
    setMessage(null);
    setValidation(null);
    setBusy("clear");
    try {
      const data = await post({ action: "clear" });
      setMessage(typeof data.message === "string" ? data.message : "Saved credentials were removed.");
      setSecretKey("");
      setPublicKey("");
      setWebhookSecret("");
      setConfirmClear(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The configuration could not be cleared.");
    } finally {
      setBusy(null);
    }
  }

  const saveDisabled = busy !== null;

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-3.5 py-2.5 text-[12px] font-medium",
            error
              ? "border-[#F6D3D0] bg-[#FDEDEC] text-[#A32B22]"
              : "border-[#C9EBD9] bg-[#EAF7F0] text-[#0B7A45]",
          )}
        >
          {error ?? message}
        </div>
      )}

      {status.unreadable && (
        <div className="flex items-start gap-2 rounded-xl border border-[#F3E2C0] bg-[#FBF4E6] px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#8A5B12]" />
          <p className="text-[11.5px] leading-relaxed text-[#8A5B12]">
            Stored credentials could not be decrypted by this runtime, so funding is treated as not
            configured. Re-enter the keys below — the ciphertext is never displayed or exported.
          </p>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold">Paystack API Configuration</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Credentials are validated server-side, encrypted with AES-256-GCM and never returned to
                this page.
              </p>
            </div>
            <span className="chip">
              <ShieldCheck className="size-3 text-brand" />
              {status.source === "saved"
                ? "Saved on server"
                : status.source === "environment"
                  ? "From server environment"
                  : "Not configured"}
            </span>
          </div>

          <div className="space-y-4 px-4 py-4">
            <SecretField
              id="paystack-secret-key"
              label="Paystack Test Secret Key"
              placeholder={TEST_SECRET_PLACEHOLDER}
              hint="Used server-side to initialise and verify transactions. Leave blank to keep the stored secret key unchanged."
              value={secretKey}
              onChange={setSecretKey}
              revealed={revealed.secret}
              onToggleReveal={() => setRevealed((state) => ({ ...state, secret: !state.secret }))}
              configured={status.secretKey.configured}
              configuredLabel={secretKindLabel}
            />

            <SecretField
              id="paystack-public-key"
              label="Paystack Test Public Key"
              placeholder={PUBLIC_KEY_PLACEHOLDER}
              hint="Stored encrypted with the rest of the configuration. Public keys are safe for inline checkout, but they are never rendered on this page."
              value={publicKey}
              onChange={setPublicKey}
              revealed={revealed.public}
              onToggleReveal={() => setRevealed((state) => ({ ...state, public: !state.public }))}
              configured={status.publicKey.configured}
              configuredLabel={publicKindLabel}
            />

            <SecretField
              id="paystack-webhook-secret"
              label="Paystack Webhook Secret"
              placeholder={WEBHOOK_PLACEHOLDER}
              hint="Verifies the x-paystack-signature header on every webhook delivery. Leave blank to keep deriving it from the secret key."
              value={webhookSecret}
              onChange={setWebhookSecret}
              revealed={revealed.webhook}
              onToggleReveal={() => setRevealed((state) => ({ ...state, webhook: !state.webhook }))}
              configured={status.webhookSecret.configured}
              configuredLabel={
                status.webhookSecret.source === "saved"
                  ? "Webhook secret saved"
                  : status.webhookSecret.source === "environment"
                    ? "From environment"
                    : "Derived from secret key"
              }
            />

            <div className="rounded-xl border border-line bg-secondary/40 px-3.5 py-3">
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-ink">
                <Lock className="size-3.5 text-brand" />
                Paystack mode: Test only
                <span className="rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10px] font-semibold text-[#0B7A45]">
                  Live not available
                </span>
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                This application is locked to test mode. Only test keys (<span className="font-mono">sk_test_…</span>{" "}
                and <span className="font-mono">pk_test_…</span>) can be stored; the server refuses live keys
                (<span className="font-mono">sk_live_…</span>) outright. Checkout takes Paystack test cards
                only — no real money moves and live charging cannot be switched on from here.
              </p>
            </div>

            <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
              <input
                type="checkbox"
                checked={verify}
                onChange={(event) => setVerify(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--brand)]"
              />
              Verify the credentials with Paystack after saving (read-only balance check, no charge).
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-secondary/40 px-4 py-3">
            <button type="submit" disabled={saveDisabled} className="btn-brand">
              {busy === "save" && <Loader2 className="size-4 animate-spin" />}
              Save Configuration
            </button>
            <button
              type="button"
              onClick={() => void runCheck()}
              disabled={busy !== null || !status.secretKey.configured}
              className="btn-ghost-line"
            >
              {busy === "validate" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Run connection check
            </button>
          </div>
        </section>
      </form>

      {validation && (
        <div
          className={cn(
            "rounded-xl border px-3.5 py-2.5",
            validation.ok
              ? "border-[#C9EBD9] bg-[#EAF7F0]"
              : "border-[#F6D3D0] bg-[#FDEDEC]",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-[12px] font-semibold",
              validation.ok ? "text-[#0B7A45]" : "text-[#A32B22]",
            )}
          >
            {validation.ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {validation.ok ? "Configuration check passed" : "Configuration check failed"}
          </p>
          <p
            className={cn(
              "mt-1 text-[11.5px] leading-relaxed",
              validation.ok ? "text-[#0B7A45]/90" : "text-[#A32B22]",
            )}
          >
            {validation.message}
          </p>
          <p className="mt-1 text-[10.5px] text-ink-muted">
            {validation.mode === "TEST" ? "Test mode" : "Live mode"} · checked {stamp(validation.checkedAt)}
          </p>
        </div>
      )}

      {status.lastValidatedAt && !validation && (
        <p className="text-[11.5px] text-ink-muted">
          Last server-side check: {status.lastValidatedOk ? "passed" : "failed"} ·{" "}
          {stamp(status.lastValidatedAt)}
          {status.lastValidationMessage ? ` — ${status.lastValidationMessage}` : ""}
        </p>
      )}

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Stored credential status</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Only whether each credential exists is shown. Saved values are never returned to the browser.
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            {
              term: "Secret key",
              value: status.secretKey.configured
                ? status.secretKey.stored
                  ? "Configured · encrypted"
                  : "Configured · environment"
                : "Not configured",
            },
            {
              term: "Public key",
              value: status.publicKey.configured
                ? status.publicKey.stored
                  ? "Configured · encrypted"
                  : "Configured · environment"
                : "Not configured",
            },
            {
              term: "Webhook secret",
              value: status.webhookSecret.configured
                ? status.webhookSecret.source === "secret-key"
                  ? "Derived from secret key"
                  : status.webhookSecret.source === "saved"
                    ? "Configured · encrypted"
                    : "Configured · environment"
                : "Not configured",
            },
          ].map((row) => (
            <div key={row.term} className="rounded-xl border border-line bg-white px-3 py-2.5">
              <dt className="section-label">{row.term}</dt>
              <dd className="mt-1 text-[12px] font-semibold text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">{status.encryption.detail}</p>
        {status.updatedAt && (
          <p className="mt-1 text-[11px] text-ink-muted">Last saved {stamp(status.updatedAt)}.</p>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-[#A32B22]">
          <AlertTriangle className="size-4" /> Clear saved configuration
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Removes the encrypted credentials and returns the gateway to test mode. Wallet funding then
          falls back to server environment variables, if any. Existing payments, ledger entries and
          webhook history are untouched.
        </p>
        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F6D3D0] bg-[#FDEDEC] px-3 text-[12px] font-semibold text-[#A32B22] transition-colors hover:bg-[#FBE3E1]"
          >
            <Trash2 className="size-3.5" /> Clear saved credentials
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void clearAll()}
              disabled={busy !== null}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#A32B22] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {busy === "clear" && <Loader2 className="size-3.5 animate-spin" />}
              Yes, clear them
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
