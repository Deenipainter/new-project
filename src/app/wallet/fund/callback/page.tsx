import React from 'react';

import { AppShell } from "@/components/layout/app-shell";
import { PaymentCallbackClient } from "@/components/wallet/payment-callback-client";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Payment status" };
export const dynamic = "force-dynamic";

export default async function PaymentCallbackPage() {
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
        <div className="panel p-5">
          <p className="section-label">Wallet funding</p>
          <h1 className="mt-1 text-[20px] font-bold">Payment status</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            We verify every payment on the server before crediting your wallet.
          </p>
          <div className="mt-4">
            <PaymentCallbackClient />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
