"use client";
import React from 'react';

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the message, not the payload: never log secrets or full request bodies.
    console.error("[app] route error:", error.message);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="panel w-full max-w-[460px] p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#FDEDEC] text-[20px] font-bold text-[#A32B22]">
          !
        </span>
        <h1 className="mt-3 text-[18px] font-bold">Something went wrong</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          This screen failed to load. Your wallet was not changed by this error. Try again, and if it keeps
          happening contact support with the time it occurred.
        </p>
        {error.digest && <p className="mt-2 text-[10.5px] text-ink-muted/70">Reference: {error.digest}</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={reset} className="btn-brand flex-1">
            Try again
          </button>
          <Link href="/" className="btn-ghost-line flex-1">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
