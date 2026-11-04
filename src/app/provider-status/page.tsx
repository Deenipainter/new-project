import React from 'react';

import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, KeyRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { loadAlrahuzHealth } from "@/lib/alrahuz-settings";
import { resendConfig } from "@/lib/config";
import {
  isPaystackConfigured,
  paystackLiveBlocked,
  paystackProviderHealth,
  resolvePaystackConfig,
} from "@/lib/payment-gateway";

export const metadata = { title: "Integration status" };
export const dynamic = "force-dynamic";

type Row = { label: string; done: boolean; detail: string };

function StatusRow({ row }: { row: Row }) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5">
      {row.done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#0B7A45]" />
      ) : (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-[#8A5B12]" />
      )}
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink">{row.label}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{row.detail}</p>
      </div>
    </li>
  );
}

export default async function ProviderStatusPage() {
  const user = await requireUser();
  const alrahuz = await loadAlrahuzHealth();
  const paystackConfig = await resolvePaystackConfig();
  const paystack = paystackProviderHealth(paystackConfig);
  const liveBlocked = paystackLiveBlocked(paystackConfig);
  const fundingReady = isPaystackConfigured(paystackConfig) && !liveBlocked;
  const credentialSource =
    paystackConfig.source === "saved"
      ? "Admin → Payment gateway settings"
      : paystackConfig.source === "environment"
        ? "Server environment variables"
        : "Not configured";
  const email = resendConfig();

  const alrahuzRows: Row[] = [
    {
      label: "API base URL (ALRAHUZ_API_BASE_URL)",
      done: Boolean(alrahuz.endpointBase),
      detail: alrahuz.endpointBase
        ? `Configured host: ${alrahuz.endpointBase}`
        : "Not set. The provider host must be supplied by the account owner — no URL is guessed.",
    },
    {
      label: "API key (Admin → Alrahuz API settings)",
      done: !alrahuz.missing.includes("ALRAHUZ_API_KEY"),
      detail:
        "Stored encrypted server-side, or supplied by ALRAHUZ_API_KEY. It is never sent to the browser or written to logs.",
    },
    {
      label: "Endpoint contract confirmed (ALRAHUZ_ENDPOINTS_VERIFIED)",
      done: alrahuz.verified,
      detail:
        "Set to true only after the official Alrahuz documentation (or the dashboard) confirms plan listing, purchase, requery and balance endpoints and their request fields.",
    },
    {
      label: "Live plan catalogue synced",
      done: false,
      detail: "Run “Sync live plans” in the admin dashboard once the three items above are complete.",
    },
  ];

  const paystackRows: Row[] = [
    {
      label: "Secret key",
      done: !paystack.missing.includes("PAYSTACK_SECRET_KEY"),
      detail: `Used server-side for initialisation and verification. Source: ${credentialSource}.`,
    },
    {
      label: "Public key",
      done: !paystack.missing.includes("PAYSTACK_PUBLIC_KEY"),
      detail: "Optional for redirect checkout, required for inline checkout later.",
    },
    {
      label: "Webhook secret",
      done: !paystack.missing.includes("PAYSTACK_WEBHOOK_SECRET"),
      detail: "Webhook URL to register: /api/payments/webhook — signatures are verified before any credit.",
    },
    {
      label: "PalmPay via Paystack (PAYSTACK_PALMPAY_ENABLED)",
      done: paystack.palmPayEnabled,
      detail: paystack.palmPayReason,
    },
    {
      label: "Live charging guard",
      done: !liveBlocked,
      detail: liveBlocked
        ? "Live keys are installed but live charging is blocked until an administrator enables live mode in Payment gateway settings. Funding is refused."
        : paystack.testMode
          ? "Test keys in use — checkout accepts Paystack test cards only. No real money moves."
          : "Live mode was enabled deliberately by an administrator.",
    },
    {
      label: "Funding switched on",
      done: fundingReady,
      detail: "Funding stays disabled until a usable secret key exists and live charging is permitted.",
    },
  ];

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        balanceKobo: user.balanceKobo,
      }}
    >
      <div className="mx-auto max-w-[720px] space-y-4">
        <div>
          <h1 className="text-[20px] font-bold sm:text-[24px]">Integration status</h1>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
            What is connected, what is not, and exactly what is required. No secrets are shown on this page.
          </p>
        </div>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Alrahuz Data (VTU provider)</h2>
            <span
              className={
                alrahuz.configured
                  ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B7A45]"
                  : "rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2 py-0.5 text-[10.5px] font-semibold text-[#8A5B12]"
              }
            >
              {alrahuz.configured ? "Configured" : "Not connected"}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {alrahuzRows.map((row) => (
              <StatusRow key={row.label} row={row} />
            ))}
          </ul>
          <div className="flex items-start gap-2 border-t border-line bg-secondary/50 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#8A5B12]" />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              No official Alrahuz API reference was available in this project and none could be located
              publicly, so no endpoint URL, request shape or service code has been hard-coded. Purchases
              stay disabled until the contract is verified — this protects your wallet from failed or
              duplicated orders.
            </p>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Paystack (wallet funding)</h2>
            <span
              className={
                fundingReady
                  ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B7A45]"
                  : "rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2 py-0.5 text-[10.5px] font-semibold text-[#8A5B12]"
              }
            >
              {fundingReady ? "Ready" : "Not configured"}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {paystackRows.map((row) => (
              <StatusRow key={row.label} row={row} />
            ))}
          </ul>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Email (Resend)</h2>
            <span
              className={
                email.configured
                  ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B7A45]"
                  : "rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2 py-0.5 text-[10.5px] font-semibold text-[#8A5B12]"
              }
            >
              {email.configured ? "Ready" : "Not configured"}
            </span>
          </div>
          <ul className="divide-y divide-line">
            <StatusRow
              row={{
                label: "RESEND_API_KEY",
                done: email.configured,
                detail: email.configured
                  ? "Verification and password-reset emails are sent through Resend."
                  : "Without a key, verification and reset emails cannot be delivered. Reset links are shown on screen in development only.",
              }}
            />
            <StatusRow
              row={{
                label: "EMAIL_FROM",
                done: Boolean(email.from),
                detail: "The verified sender address on your Resend domain.",
              }}
            />
          </ul>
        </section>

        <div className="panel flex items-start gap-2.5 p-4">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-brand" />
          <div>
            <p className="text-[12.5px] font-semibold">How to add credentials safely</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
              Store provider keys in Admin → Alrahuz API settings (or Payment gateway settings), where they
              are encrypted before storage, or in the project environment file. Never put keys in page
              code, browser storage or chat. Keys remain server-side and are redacted from diagnostics.
            </p>
            <Link
              href="/admin"
              className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
            >
              Admin dashboard
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
