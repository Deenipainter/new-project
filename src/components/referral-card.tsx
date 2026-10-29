"use client";
import React from 'react';

import { useState } from "react";
import { Check, Copy, Users } from "lucide-react";

export function ReferralCard({
  code,
  total,
  qualified,
}: {
  code: string;
  total: number;
  qualified: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/register?ref=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-tint text-brand">
            <Users className="size-[17px]" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold">Invite &amp; earn</p>
            <p className="text-[11.5px] text-ink-muted">
              {total} invited · {qualified} qualified
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-brand/40"
        >
          {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-line bg-secondary/60 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Your code</span>
        <span className="numeric text-[13px] font-bold tracking-[0.08em] text-ink">{code}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
        Rewards pay only after a referred account is verified and funded. No reward is promised before
        that rule is configured.
      </p>
    </div>
  );
}
