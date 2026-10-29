import React from 'react';

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { BrandLockup } from "@/components/brand";

const POINTS = [
  "An append-only wallet ledger, not a number in your profile.",
  "Server-side pricing — the browser cannot change what you pay.",
  "Receipts with references you can trace with support.",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:order-2 lg:justify-center lg:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-7 lg:hidden">
            <BrandLockup />
          </div>
          <h1 className="text-[24px] font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-[12.5px] leading-relaxed text-ink-muted">{footer}</div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-[#0A6B51] px-12 py-10 text-white lg:order-1 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-[360px] rounded-full"
          style={{ background: "radial-gradient(circle,rgba(34,197,94,0.35),transparent 65%)" }}
          aria-hidden="true"
        />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-white/15 text-[13px] font-bold">
              DP
            </span>
            <span className="text-[15px] font-bold">DP Data Sub</span>
          </Link>
          <h2 className="mt-12 max-w-[20ch] text-[34px] font-bold leading-[1.1] tracking-[-0.02em]">
            Your data, your way.
          </h2>
          <p className="mt-3 max-w-[38ch] text-[14px] leading-relaxed text-white/75">
            One wallet for data, airtime and bills — with a ledger that proves every naira moved.
          </p>
        </div>

        <ul className="relative space-y-3">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-[13px] text-white/85">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#8AE6B0]" />
              {point}
            </li>
          ))}
        </ul>

        <p className="relative text-[11.5px] text-white/50">
          Nigeria · Naira (₦) · Wallet balances are stored in kobo for exact accounting.
        </p>
      </aside>
    </div>
  );
}
