"use client";
import React from 'react';

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export function VerifyEmailClient({ token }: { token: string }) {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Confirming your email…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState("error");
          setMessage(payload.error ?? "This verification link did not work.");
          return;
        }
        setState("done");
        setMessage(payload.message ?? "Email verified.");
      } catch {
        setState("error");
        setMessage("Network problem. Please open the link again.");
      }
    })();
  }, [token]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-secondary/60 px-4 py-3">
        {state === "working" && <Loader2 className="mt-0.5 size-4 animate-spin text-brand" />}
        {state === "done" && <CheckCircle2 className="mt-0.5 size-4 text-[#0B7A45]" />}
        {state === "error" && <XCircle className="mt-0.5 size-4 text-[#C0392B]" />}
        <p className="text-[13px] leading-relaxed text-ink">{message}</p>
      </div>
      <Link href="/" className="btn-brand w-full">
        Go to dashboard
      </Link>
    </div>
  );
}
