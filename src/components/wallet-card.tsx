"use client";
import React from 'react';

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";

import { formatNaira } from "@/lib/money";

export function WalletCard({
  balanceKobo,
  fullName,
}: {
  balanceKobo: number;
  fullName: string;
}) {
  const [visible, setVisible] = useState(true);
  const firstName = fullName.split(" ")[0] ?? "there";

  return (
    <section
      className="wallet-surface rounded-[20px] p-5 text-white shadow-[0_18px_40px_-24px_rgba(6,102,74,0.9)]"
      aria-label="Wallet balance"
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
              Wallet balance
            </p>
            <p className="numeric mt-1.5 text-[30px] font-bold leading-none sm:text-[34px]">
              {visible ? formatNaira(balanceKobo, { withDecimals: true }) : "₦ •••• ••"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="grid size-9 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            aria-label={visible ? "Hide balance" : "Show balance"}
            aria-pressed={!visible}
          >
            {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
        </div>

        <p className="mt-3 text-[13px] text-white/75">
          Welcome back, {firstName}. {balanceKobo > 0 ? "You are ready to top up." : "Add money to start buying."}
        </p>

        <div className="mt-4 flex items-center gap-2.5">
          <Link
            href="/wallet/fund"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-[13.5px] font-semibold text-brand-dark transition-colors hover:bg-white/90"
          >
            <Plus className="size-4" />
            Fund Wallet
          </Link>
          <Link
            href="/transactions"
            className="inline-flex h-10 items-center rounded-xl border border-white/30 px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-white/10"
          >
            History
          </Link>
        </div>
      </div>
    </section>
  );
}
