import React from 'react';

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <h1 className="text-[24px] font-bold">Support</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
        Tell us your transaction reference and we can trace it in the wallet ledger.
      </p>

      <section className="panel mt-5 p-5">
        <h2 className="text-[14px] font-semibold">Before you write to us</h2>
        <ol className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-ink-muted">
          <li>1. Open Transactions and copy the reference of the order in question.</li>
          <li>2. If an order is pending, open it and use “Check status” — it will never be resubmitted twice.</li>
          <li>3. If a payment was made but the wallet was not credited, keep the payment reference.</li>
        </ol>
      </section>

      <section className="panel mt-3 p-5">
        <h2 className="text-[14px] font-semibold">Contact</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          Email support with your account email and the transaction reference. We never ask for your
          password, card PIN, BVN, NIN or crypto seed phrase.
        </p>
        <a
          href="mailto:support@dpdatasub.ng"
          className="btn-brand mt-3 inline-flex"
        >
          Email support
        </a>
        <p className="mt-2 text-[11px] text-ink-muted">
          Until a support inbox is configured, this address is a placeholder — the owner must set the real
          support mailbox in the deployment environment.
        </p>
      </section>
    </div>
  );
}
