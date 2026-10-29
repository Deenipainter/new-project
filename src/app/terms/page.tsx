import React from 'react';

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Terms" };

const SECTIONS = [
  {
    title: "The service",
    body: "DP Data Sub sells data bundles, airtime and bill payments from a prepaid wallet. A service appears only when its provider integration is configured and verified.",
  },
  {
    title: "Wallet and payments",
    body: "Your balance is derived from an append-only ledger. Wallet funding is credited only after the payment provider independently confirms the payment. Pending orders are reconciled before any retry or refund.",
  },
  {
    title: "No guaranteed delivery",
    body: "Delivery depends on the upstream network and provider. If a provider fails an order, the wallet is refunded according to the verified provider result. We do not simulate success.",
  },
  {
    title: "Fair use",
    body: "Do not use the service for fraud, money laundering or to resell without agreement. Repeated abuse or chargeback attempts can result in account suspension.",
  },
  {
    title: "Withdrawals",
    body: "Withdrawals and wallet transfers are disabled until payout authorisation, limits and reconciliation are implemented and tested.",
  },
  {
    title: "Contact",
    body: "Questions about these terms can be sent to the support address on the Support page.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <h1 className="text-[24px] font-bold">Terms of service</h1>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
        A plain summary for customers. The account owner should have final terms reviewed before public
        launch.
      </p>
      <div className="mt-5 space-y-3">
        {SECTIONS.map((section) => (
          <section key={section.title} className="panel p-4">
            <h2 className="text-[14px] font-semibold">{section.title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
