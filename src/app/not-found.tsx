import React from 'react';

import Link from "next/link";

import { BrandLockup } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-[460px] text-center">
        <div className="flex justify-center">
          <BrandLockup />
        </div>
        <div className="panel mt-6 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">404</p>
          <h1 className="mt-1 text-[19px] font-bold">We could not find that page</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            The link may be old, or the page may have moved. Your wallet and transactions are unaffected.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/" className="btn-brand flex-1">
              Go to dashboard
            </Link>
            <Link href="/support" className="btn-ghost-line flex-1">
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
