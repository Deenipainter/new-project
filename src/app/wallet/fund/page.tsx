import React from 'react';

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { FundWalletForm } from "@/components/wallet/fund-form";
import { requireUser } from "@/lib/auth";
import { paystackChannelConfig } from "@/lib/config";
import {
  isPaystackConfigured,
  paystackLiveBlocked,
  paystackProviderHealth,
  resolvePaystackConfig,
} from "@/lib/payment-gateway";
import { formatNaira } from "@/lib/money";
import { resolvePaymentMethods } from "@/lib/payment-methods";

export const metadata = { title: "Fund wallet" };
export const dynamic = "force-dynamic";

export default async function FundWalletPage() {
  const user = await requireUser();
  const paystack = await resolvePaystackConfig();
  const paymentsReady = isPaystackConfigured(paystack) && !paystackLiveBlocked(paystack);
  const health = paystackProviderHealth(paystack);
  const channelConfig = paystackChannelConfig();
  const methods = resolvePaymentMethods({
    paymentsReady,
    declaredChannels: channelConfig.declaredChannels,
    palmPayEnabled: channelConfig.palmPayEnabled,
  });

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
          <h1 className="mt-1 text-[20px] font-bold">Fund wallet</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Current balance {formatNaira(user.balanceKobo, { withDecimals: true })}. Funding is credited
            only after verified payment.
          </p>

          <div className="mt-4">
            <FundWalletForm
              paymentsReady={paymentsReady}
              missing={health.missing}
              methods={methods}
              testMode={health.testMode}
              palmPayNote={health.palmPayReason}
            />
          </div>
        </div>

        <div className="panel mt-3 p-4">
          <p className="section-label">How funding works</p>
          <ol className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-ink-muted">
            <li>
              <span className="font-semibold text-ink">1.</span> Our server creates a payment request tied to
              your account and the method you picked.
            </li>
            <li>
              <span className="font-semibold text-ink">2.</span> Paystack runs checkout — including PalmPay,
              which Paystack serves under its Bank option. Card and wallet details never touch DP Data Sub.
            </li>
            <li>
              <span className="font-semibold text-ink">3.</span> A signed webhook plus a server-side
              verification confirm the payment before your ledger is credited.
            </li>
            <li>
              <span className="font-semibold text-ink">4.</span> The credit and the payment status commit
              together, and duplicate events are ignored, so one payment can never credit you twice.
            </li>
          </ol>
        </div>
      </div>
    </AppShell>
  );
}
