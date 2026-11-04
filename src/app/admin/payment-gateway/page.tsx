import React from 'react';

import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

import { PaystackSettingsForm } from "@/components/admin/paystack-settings-form";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth";
import { loadPaymentGatewayStatus } from "@/lib/payment-gateway";

export const metadata = { title: "Payment gateway settings" };
export const dynamic = "force-dynamic";

export default async function PaymentGatewaySettingsPage() {
  // Server-side guard: requireAdmin redirects anyone who is not an ADMIN, and the
  // API route re-checks the role on every request.
  const admin = await requireAdmin();
  const [status, headerList] = await Promise.all([loadPaymentGatewayStatus(), headers()]);

  const configuredOrigin =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "") ||
    `https://${headerList.get("host") ?? "localhost:3000"}`;
  const webhookUrl = `${configuredOrigin}/api/payments/webhook`;
  const callbackUrl = `${configuredOrigin}/wallet/fund/callback?reference=DPF-…`;

  return (
    <AppShell
      user={{
        id: admin.id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        balanceKobo: admin.balanceKobo,
      }}
    >
      <div className="mx-auto max-w-[760px] space-y-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Admin dashboard
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-label flex items-center gap-1.5">
              <KeyRound className="size-3 text-brand" /> Admin only
            </p>
            <h1 className="mt-1 text-[20px] font-bold sm:text-[24px]">Payment Gateway Settings</h1>
            <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-ink-muted">
              Manage the Paystack credentials that wallet funding uses. Secrets are encrypted on the
              server and are never sent back to this page.
            </p>
          </div>
          <span className="chip shrink-0">
            <ShieldCheck className="size-3 text-brand" /> Test mode only
          </span>
        </div>

        <PaystackSettingsForm status={status} />

        <section className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">URLs for the Paystack dashboard</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              These are the routes this application already serves. Nothing here changed them.
            </p>
          </div>
          <dl className="divide-y divide-line">
            <div className="px-4 py-3">
              <dt className="section-label">Webhook URL</dt>
              <dd className="mt-1 select-all break-all font-mono text-[11.5px] text-ink">{webhookUrl}</dd>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Register this in Paystack → Settings → API Keys &amp; Webhooks. Every delivery is
                signature-checked before any wallet credit.
              </p>
            </div>
            <div className="px-4 py-3">
              <dt className="section-label">Callback pattern</dt>
              <dd className="mt-1 select-all break-all font-mono text-[11.5px] text-ink">{callbackUrl}</dd>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Sent per transaction at initialisation from the browser's own origin. The redirect only
                displays status — the server verification decides whether a wallet is credited.
              </p>
            </div>
          </dl>
        </section>

        <section className="panel p-4">
          <h2 className="text-[14px] font-semibold">How these credentials are protected</h2>
          <ul className="mt-2 space-y-2">
            {[
              "Secrets are encrypted with AES-256-GCM before they reach PostgreSQL; only ciphertext is stored and the key stays in server-side environment variables.",
              "Every save, validation and clear action is written to the audit trail with non-secret metadata only.",
              "Key values are never logged, never returned in an API response and are dropped from this form as soon as they are stored.",
              "Live charging is disabled here: the server refuses sk_live_ keys, so only test keys can be stored and no real card can be charged.",
              "Validation uses Paystack's read-only balance endpoint, so a check can never move money.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#0B7A45]" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
