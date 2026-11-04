"use client";
import React from 'react';

import Link from "next/link";
import { useState } from "react";
import {
  CreditCard,
  Landmark,
  LayoutGrid,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import { formatNaira } from "@/lib/money";
import type { PaymentMethodId, PaymentMethodOption } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

const PRESETS = [500, 1000, 2000, 5000, 10000, 20000];
// Channel selection is resolved server-side; the browser only sends a method id.

const METHOD_ICONS: Record<PaymentMethodId, React.ComponentType<{ className?: string }>> = {
  any: LayoutGrid,
  palmpay: Wallet,
  card: CreditCard,
  bank_transfer: Landmark,
  ussd: Smartphone,
};

export function FundWalletForm({
  paymentsReady,
  missing,
  methods,
  testMode,
  palmPayNote,
}: {
  paymentsReady: boolean;
  missing: string[];
  methods: PaymentMethodOption[];
  testMode: boolean;
  palmPayNote?: string;
}) {
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingKeys, setMissingKeys] = useState<string[]>(missing);
  const [method, setMethod] = useState<PaymentMethodId>(
    () => methods.find((option) => option.available)?.id ?? "any",
  );

  const naira = Number(amount.replace(/[^\d.]/g, ""));
  const amountKobo = Number.isFinite(naira) ? Math.round(naira * 100) : 0;
  const valid = amountKobo >= 10000 && amountKobo <= 50_000_000;
  const selected = methods.find((option) => option.id === method);
  const methodUsable = Boolean(selected?.available);
  const palmPay = methods.find((option) => option.id === "palmpay");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentsReady || !methodUsable) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo, paymentMethod: method }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "We could not start that payment.");
        if (Array.isArray(payload.details?.missing)) setMissingKeys(payload.details.missing);
        return;
      }
      if (payload.authorizationUrl) {
        window.location.href = payload.authorizationUrl;
        return;
      }
      setError("The payment provider did not return a checkout link. Nothing was charged.");
    } catch {
      setError("Network problem. Nothing was charged — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => {
          const active = naira === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className={
                active
                  ? "rounded-xl border border-brand bg-brand-tint py-2.5 text-[12.5px] font-semibold text-brand"
                  : "rounded-xl border border-line bg-white py-2.5 text-[12.5px] font-medium text-ink hover:border-brand/30"
              }
            >
              {formatNaira(preset * 100)}
            </button>
          );
        })}
      </div>

      <div>
        <label htmlFor="amount" className="field-label">
          Amount (₦)
        </label>
        <input
          id="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
          className="app-input text-[17px] font-semibold"
          placeholder="1000"
        />
        <p className="field-hint">Minimum ₦100 · Maximum ₦500,000 per attempt.</p>
      </div>

      <fieldset>
        <legend className="field-label">Payment method</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {methods.map((option) => {
            const Icon = METHOD_ICONS[option.id];
            const active = method === option.id;
            const disabled = !option.available;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                  active && !disabled
                    ? "border-brand bg-brand-tint"
                    : "border-line bg-white hover:border-brand/30",
                  disabled && "cursor-not-allowed border-line bg-secondary/60 hover:border-line",
                )}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={option.id}
                  checked={active}
                  disabled={disabled || busy}
                  onChange={() => setMethod(option.id)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                    active && !disabled ? "bg-brand text-white" : "bg-secondary text-ink-muted",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-[12.5px] font-semibold",
                        disabled ? "text-ink-muted" : "text-ink",
                      )}
                    >
                      {option.label}
                    </span>
                    {disabled && <Lock className="size-3 text-ink-muted" aria-hidden />}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                    {option.available ? option.description : "Not available on this account yet."}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {method === "palmpay" && selected?.available && (
          <p className="mt-2 rounded-lg bg-brand-tint/70 px-3 py-2 text-[11px] leading-relaxed text-brand-dark">
            At checkout choose <span className="font-semibold">Bank</span>, then{" "}
            <span className="font-semibold">PalmPay</span>. Paystack handles the wallet authorisation — DP Data
            Sub never sees your PalmPay PIN.
          </p>
        )}

        {palmPay && !palmPay.available && (
          <p className="mt-2 rounded-lg border border-[#F3E2C0] bg-[#FBF6EA] px-3 py-2 text-[11px] leading-relaxed text-[#6B4A10]">
            <span className="font-semibold">PalmPay setup required.</span>{" "}
            {palmPayNote ?? palmPay.unavailableReason}
          </p>
        )}
      </fieldset>

      {testMode && paymentsReady && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-[11px] font-medium text-ink-muted">
          Test mode is active. Checkout uses Paystack test keys — no real money moves.
        </p>
      )}

      {!paymentsReady && (
        <div className="rounded-xl border border-[#F3E2C0] bg-[#FBF6EA] px-3.5 py-3">
          <p className="text-[12.5px] font-semibold text-[#6B4A10]">Payments are not configured</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#7A5A22]">
            Wallet funding stays switched off until a payment provider key and webhook secret exist. No
            deposit can be faked, and no money is collected.
          </p>
          {missingKeys.length > 0 && (
            <ul className="mt-2 space-y-1">
              {missingKeys.map((key) => (
                <li key={key} className="rounded-lg bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[#6B4A10]">
                  {key}
                </li>
              ))}
            </ul>
          )}
          <Link href="/provider-status" className="mt-2 inline-flex text-[11.5px] font-semibold text-brand hover:underline">
            See the setup checklist
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[12px] font-medium text-[#A32B22]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !valid || !paymentsReady || !methodUsable}
        className="btn-brand w-full"
        aria-busy={busy}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? "Opening checkout…" : `Fund wallet${valid ? ` · ${formatNaira(amountKobo)}` : ""}`}
      </button>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
        Your wallet is credited only after our server independently verifies the payment with Paystack. A
        redirect alone never credits a wallet, and one payment can never credit twice.
      </p>
    </form>
  );
}
