"use client";
import React from 'react';

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type { AlrahuzSettingsStatus, AlrahuzValidationResult } from "@/lib/alrahuz-settings";
import { cn } from "@/lib/utils";

const SCHEMES = ["Token", "Bearer"] as const;

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

function stateLabel(state: AlrahuzSettingsStatus["state"]): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "failed":
      return "Connection Failed";
    case "untested":
      return "Not verified yet";
    default:
      return "Not Configured";
  }
}

export function AlrahuzSettingsForm({ status }: { status: AlrahuzSettingsStatus }) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? "");
  const [authScheme, setAuthScheme] = useState<string>(status.authScheme);
  const [checkPath, setCheckPath] = useState(status.checkPath);
  const [showKey, setShowKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [verify, setVerify] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "test" | "clear">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<AlrahuzValidationResult | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/alrahuz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; validation?: AlrahuzValidationResult | null }
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
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        authScheme,
        checkPath: checkPath.trim() || undefined,
        verify,
      });
      setMessage(typeof data.message === "string" ? data.message : "Configuration saved.");
      if (data.validation) setValidation(data.validation);
      // Drop the plaintext key from component state as soon as it is stored.
      setApiKey("");
      setShowKey(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The configuration could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function runTest() {
    setError(null);
    setMessage(null);
    setBusy("test");
    try {
      const data = await post({ action: "test" });
      setValidation(data.validation ?? null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The connection test failed.");
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
      setApiKey("");
      setBaseUrl("");
      setConfirmClear(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The configuration could not be cleared.");
    } finally {
      setBusy(null);
    }
  }

  const pillClass =
    status.state === "connected"
      ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#0B7A45]"
      : status.state === "failed"
        ? "border-[#F6D3D0] bg-[#FDEDEC] text-[#A32B22]"
        : "border-line bg-white text-ink-muted";

  return (
    <div className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">Connection status</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              Based on the last read-only check this server ran against Alrahuz. No transaction is ever
              sent from this page.
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              pillClass,
            )}
          >
            {status.state === "connected" ? (
              <CheckCircle2 className="size-3" />
            ) : status.state === "failed" ? (
              <AlertTriangle className="size-3" />
            ) : (
              <PlugZap className="size-3" />
            )}
            {stateLabel(status.state)}
          </span>
        </div>
        <dl className="grid gap-2 px-4 py-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-white px-3 py-2.5">
            <dt className="section-label">API key</dt>
            <dd className="mt-1 text-[12px] font-semibold text-ink">
              {status.apiKey.stored
                ? status.apiKey.masked
                : status.apiKey.configured
                  ? "From server environment"
                  : "Not configured"}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-white px-3 py-2.5">
            <dt className="section-label">Base URL</dt>
            <dd className="mt-1 break-all font-mono text-[11px] font-semibold text-ink">
              {status.baseUrl ?? "Not configured"}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-white px-3 py-2.5">
            <dt className="section-label">Last test</dt>
            <dd className="mt-1 text-[12px] font-semibold text-ink">
              {status.lastValidatedAt ? stamp(status.lastValidatedAt) : "Never tested"}
            </dd>
          </div>
        </dl>
        {status.lastValidationMessage && !validation && (
          <p className="border-t border-line bg-secondary/40 px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
            Last result: {status.lastValidatedOk ? "passed" : "failed"} — {status.lastValidationMessage}
          </p>
        )}
      </section>

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
            A stored key exists but this runtime cannot decrypt it, so Alrahuz is treated as not
            configured. Enter the key again below — the old ciphertext is never displayed or exported.
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
              <h2 className="text-[14px] font-semibold">Alrahuz API Configuration</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Validated on the server, encrypted with AES-256-GCM before storage and never returned to
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
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="alrahuz-api-key" className="text-[13px] font-medium text-ink">
                  Alrahuz API Key
                </label>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
                    status.apiKey.configured
                      ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#0B7A45]"
                      : "border-line bg-white text-ink-muted",
                  )}
                >
                  {status.apiKey.configured ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {status.apiKey.stored
                    ? `Saved · ${status.apiKey.masked}`
                    : status.apiKey.configured
                      ? "From environment"
                      : "Not configured"}
                </span>
              </div>

              <div className="relative mt-1.5">
                <input
                  id="alrahuz-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={
                    status.apiKey.stored ? "Paste a new key to replace the saved one" : "Paste your Alrahuz API key"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-describedby="alrahuz-api-key-hint"
                  className="app-input pr-12 font-mono text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  aria-pressed={showKey}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-secondary hover:text-ink"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p id="alrahuz-api-key-hint" className="field-hint">
                {status.apiKey.stored
                  ? "A key is already stored and is masked for security. Leave this blank to keep it, or paste a new key to replace it."
                  : "Stored encrypted on the server. This field is cleared as soon as the key is saved."}
              </p>
            </div>

            <div>
              <label htmlFor="alrahuz-base-url" className="text-[13px] font-medium text-ink">
                Alrahuz API Base URL
              </label>
              <input
                id="alrahuz-base-url"
                type="url"
                inputMode="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://… (from the Alrahuz documentation)"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="alrahuz-base-url-hint"
                className="app-input mt-1.5 font-mono text-[13px]"
              />
              <p id="alrahuz-base-url-hint" className="field-hint">
                Use the exact HTTPS host Alrahuz gives you — this application does not guess or hard-code a
                provider URL. A path prefix is allowed; query strings are not.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              aria-expanded={advanced}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", advanced && "rotate-180")} />
              Authentication and test details
            </button>

            {advanced && (
              <div className="grid gap-4 rounded-xl border border-line bg-secondary/40 px-3.5 py-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="alrahuz-auth-scheme" className="text-[12.5px] font-medium text-ink">
                    Authorization header
                  </label>
                  <select
                    id="alrahuz-auth-scheme"
                    value={authScheme}
                    onChange={(event) => setAuthScheme(event.target.value)}
                    className="app-input mt-1.5 text-[13px]"
                  >
                    {SCHEMES.map((scheme) => (
                      <option key={scheme} value={scheme}>
                        Authorization: {scheme} &lt;key&gt;
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Match the header scheme in the Alrahuz API documentation. The key is never placed in a
                    URL or the browser.
                  </p>
                </div>

                <div>
                  <label htmlFor="alrahuz-check-path" className="text-[12.5px] font-medium text-ink">
                    Read-only check path
                  </label>
                  <input
                    id="alrahuz-check-path"
                    type="text"
                    value={checkPath}
                    onChange={(event) => setCheckPath(event.target.value)}
                    placeholder="/api/user/"
                    autoComplete="off"
                    spellCheck={false}
                    className="app-input mt-1.5 font-mono text-[13px]"
                  />
                  <p className="field-hint">
                    A GET-only account/wallet endpoint from the documentation, used by Test Connection.
                    Replace the suggestion with the path Alrahuz documents.
                  </p>
                </div>
              </div>
            )}

            <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
              <input
                type="checkbox"
                checked={verify}
                onChange={(event) => setVerify(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--brand)]"
              />
              Test the connection automatically after saving (one read-only GET, no order is placed).
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-secondary/40 px-4 py-3">
            <button type="submit" disabled={busy !== null} className="btn-brand">
              {busy === "save" && <Loader2 className="size-4 animate-spin" />}
              Save Configuration
            </button>
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={busy !== null}
              className="btn-ghost-line"
            >
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Test Connection
            </button>
          </div>
        </section>
      </form>

      {validation && (
        <div
          className={cn(
            "rounded-xl border px-3.5 py-2.5",
            validation.ok ? "border-[#C9EBD9] bg-[#EAF7F0]" : "border-[#F6D3D0] bg-[#FDEDEC]",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-[12px] font-semibold",
              validation.ok ? "text-[#0B7A45]" : "text-[#A32B22]",
            )}
          >
            {validation.ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {validation.ok
              ? "Connected"
              : validation.state === "not-configured"
                ? "Not Configured"
                : "Connection Failed"}
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
            Checked {stamp(validation.checkedAt)}
            {validation.httpStatus ? ` · HTTP ${validation.httpStatus}` : ""}
          </p>
        </div>
      )}

      <section className="panel p-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
          <Lock className="size-4 text-brand" /> How this key is protected
        </h2>
        <ul className="mt-2 space-y-2">
          {[
            "The API key is encrypted with AES-256-GCM before it reaches PostgreSQL. The encryption key stays in a server-side environment variable.",
            "The browser only ever receives whether a key exists, a fixed mask and the connection result — never the key, a fragment or its ciphertext.",
            "Saving, testing and clearing are written to the audit trail with non-secret metadata only.",
            "Test Connection performs a single read-only GET. It cannot place an order, move wallet funds or trigger a VTU transaction.",
            "Only an ADMIN session can reach the page or the API route; the role is re-checked on every request.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#0B7A45]" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-[#A32B22]">
          <AlertTriangle className="size-4" /> Remove saved configuration
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Deletes the encrypted key and base URL. Any ALRAHUZ_* environment values still apply. Existing
          orders, wallet records and audit history are untouched.
        </p>
        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F6D3D0] bg-[#FDEDEC] px-3 text-[12px] font-semibold text-[#A32B22] transition-colors hover:bg-[#FBE3E1]"
          >
            <Trash2 className="size-3.5" /> Remove saved credentials
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
              Yes, remove them
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
