import React from 'react';

import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[11px] text-[13px] font-bold tracking-tight text-white",
        className,
      )}
      style={{ backgroundImage: "linear-gradient(140deg,#0A8F66,#06664A)" }}
      aria-hidden="true"
    >
      DP
      <span
        className="pointer-events-none absolute -right-2 -top-3 size-6 rounded-full"
        style={{ background: "rgba(34,197,94,0.55)" }}
      />
    </span>
  );
}

export function BrandLockup({
  href = "/",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-none">
      <LogoMark />
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight text-ink">DP Data Sub</span>
        {!compact && (
          <span className="mt-1 block text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-muted">
            Your Data, Your Way.
          </span>
        )}
      </span>
    </Link>
  );
}
