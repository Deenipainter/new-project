import React from 'react';

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { FundWalletForm } from "@/components/wallet/fund-form";
import { requireUser } from "@/lib/auth";
import { isPaystackReady, paystackHealth } from "@/lib/config";
import { formatNaira } from "@/lib/money";

export const metadata = { title: "Add money" };
export const dynamic = "force-dynamic";

export default async function FundWalletPage() {
  const user = await requireUser();

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
      <div className="mx-auto max-w-[520px]">
        <Link
          href="/wallet"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Wallet
        </Link>

        <div className="panel p-5">
          <p className="section-label">Wallet funding</p>
          <h1 className="mt-1 text-[20px] font-bold">Add money</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Current balance {formatNaira(user.balanceKobo, { withDecimals: true })}. Funding is credited
            only after verified payment.
          </p>

          <div className="mt-4">
            <FundWalletForm paymentsReady={isPaystackReady()} missing={paystackHealth().missing} />
          </div>
        </div>

        <div className="panel mt-3 p-4">
          <p className="section-label">How funding works</p>
          <ol className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-ink-muted">
            <li>
              <span className="font-semibold text-ink">1.</span> Our server creates a payment request tied to
              your account.
            </li>
            <li>
              <span className="font-semibold text-ink">2.</span> The provider handles checkout — card details
              never touch DP Data Sub.
            </li>
            <li>
              <span className="font-semibold text-ink">3.</span> A signed webhook plus a server-side
              verification confirm the payment before your ledger is credited.
            </li>
            <li>
              <span className="font-semibold text-ink">4.</span> Duplicate events are ignored, so one payment
              can never credit you twice.
            </li>
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
