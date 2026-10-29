"use client";
import React from 'react';

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";

import { formatNaira } from "@/lib/money";

type State = "working" | "success" | "pending" | "failed";

export function PaymentCallbackClient() {
  const [state, setState] = useState<State>("working");
  const [message, setMessage] = useState("Confirming your payment with the provider…");
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference") || params.get("trxref");
    setReference(ref);

    if (!ref) {
      setState("failed");
      setMessage("This page did not receive a payment reference.");
      return;
    }

    (async () => {
      try {
        const response = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState("failed");
          setMessage(payload.error ?? "We could not verify that payment.");
          return;
        }
        if (payload.status === "SUCCESSFUL") {
          setState("success");
          setBalanceKobo(typeof payload.balanceKobo === "number" ? payload.balanceKobo : null);
          setMessage(payload.message ?? "Payment verified and wallet credited.");
          return;
        }
        if (payload.status === "PENDING") {
          setState("pending");
          setMessage(payload.message ?? "The provider has not confirmed this payment yet.");
          return;
        }
        setState("failed");
        setMessage(payload.message ?? "This payment was not completed.");
      } catch {
        setState("pending");
        setMessage(
          "We could not reach the server to verify this payment. It is safe to refresh — a payment is only credited once.",
        );
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div
        className={
          state === "success"
            ? "rounded-xl border border-[#C9EBD9] bg-[#EAF7F0] px-4 py-3"
            : state === "failed"
              ? "rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-4 py-3"
              : "rounded-xl border border-line bg-secondary/60 px-4 py-3"
        }
      >
        <div className="flex items-start gap-2.5">
          {state === "working" && <Loader2 className="mt-0.5 size-4 animate-spin text-brand" />}
          {state === "success" && <CheckCircle2 className="mt-0.5 size-4 text-[#0B7A45]" />}
          {state === "pending" && <Clock3 className="mt-0.5 size-4 text-[#8A5B12]" />}
          {state === "failed" && <XCircle className="mt-0.5 size-4 text-[#C0392B]" />}
          <div>
            <p className="text-[13px] font-semibold text-ink">
              {state === "working"
                ? "Verifying"
                : state === "success"
                  ? "Wallet credited"
                  : state === "pending"
                    ? "Payment pending"
                    : "Payment not completed"}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{message}</p>
            {state === "success" && balanceKobo !== null && (
              <p className="numeric mt-1.5 text-[13px] font-semibold text-ink">
                New balance {formatNaira(balanceKobo, { withDecimals: true })}
              </p>
            )}
            {reference && (
              <p className="mt-1.5 break-all text-[10.5px] text-ink-muted/80">Reference: {reference}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/wallet" className="btn-brand flex-1">
          Go to wallet
        </Link>
        <Link href="/transactions" className="btn-ghost-line flex-1">
          View transactions
        </Link>
      </div>
    </div>
  );
}
