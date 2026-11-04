import React from 'react';

import Link from "next/link";
import { ArrowLeft, BookOpen, KeyRound, ShieldCheck } from "lucide-react";

import { AlrahuzSettingsForm } from "@/components/admin/alrahuz-settings-form";
import { AppShell } from "@/components/layout/app-shell";
import { loadAlrahuzStatus } from "@/lib/alrahuz-settings";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Alrahuz API settings" };
export const dynamic = "force-dynamic";

export default async function AlrahuzSettingsPage() {
  // Server-side guard: requireAdmin redirects anyone who is not an ADMIN, and the
  // API route re-checks the role on every request.
  const admin = await requireAdmin();
  const status = await loadAlrahuzStatus();

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
            <h1 className="mt-1 text-[20px] font-bold sm:text-[24px]">Alrahuz API Settings</h1>
            <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-ink-muted">
              Store the Alrahuz Data API key and base URL here. The key is encrypted on the server and is
              never shown again after saving.
            </p>
          </div>
          <span className="chip shrink-0">
            <ShieldCheck className="size-3 text-brand" /> No live VTU traffic
          </span>
        </div>

        <AlrahuzSettingsForm status={status} />

        <section className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
              <BookOpen className="size-4 text-brand" /> What Alrahuz requires
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              Confirm these in the Alrahuz documentation or dashboard before saving.
            </p>
          </div>
          <dl className="divide-y divide-line">
            {[
              {
                term: "API key",
                detail:
                  "The account API token issued by Alrahuz. It is sent only from this server to the host you configure.",
              },
              {
                term: "Base URL",
                detail:
                  "The HTTPS host for the API, exactly as supplied by Alrahuz (for example the host you sign in to for your account). This project does not assume a provider URL.",
              },
              {
                term: "Authorization header",
                detail:
                  "Whether the key is sent as 'Authorization: Token <key>' or 'Authorization: Bearer <key>'. The default is Token; change it if your documentation says otherwise.",
              },
              {
                term: "Read-only check path",
                detail:
                  "A GET endpoint that returns account or wallet information, used by Test Connection. No purchase, requery or balance-moving request is sent.",
              },
              {
                term: "Endpoint contract (ALRAHUZ_ENDPOINTS_VERIFIED)",
                detail:
                  "Real vending stays disabled until the plan, purchase and requery paths are confirmed and this server flag is set deliberately. Saving credentials here does not enable live orders.",
              },
            ].map((row) => (
              <div key={row.term} className="px-4 py-3">
                <dt className="section-label">{row.term}</dt>
                <dd className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{row.detail}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line bg-secondary/40 px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
            Alrahuz publicly advertises a developer API, but no public documentation portal or endpoint
            reference could be located, so no path or request shape is guessed here. Ask Alrahuz support
            for the API base URL, authentication header and read-only account endpoint, then enter exactly
            what they provide.
          </p>
        </section>

        <section className="panel p-4">
          <h2 className="text-[14px] font-semibold">Related settings</h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
            Paystack wallet funding is configured separately and stays in test mode. Nothing on this page
            changes it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/payment-gateway" className="btn-ghost-line">
              <KeyRound className="size-4" /> Payment gateway settings
            </Link>
            <Link href="/provider-status" className="btn-ghost-line">
              <ShieldCheck className="size-4" /> Integration status
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
