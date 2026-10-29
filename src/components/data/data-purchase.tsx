"use client";
import React from 'react';

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

type Plan = {
  planCode: string;
  network: string;
  dataType: string;
  name: string;
  validity: string;
  priceKobo: number;
  sizeMb: number;
  source: "REFERENCE" | "PROVIDER";
};

const NETWORKS = [
  { id: "MTN", label: "MTN", dot: "#FFCC00" },
  { id: "AIRTEL", label: "Airtel", dot: "#E40000" },
  { id: "GLO", label: "Glo", dot: "#00A651" },
  { id: "9MOBILE", label: "9mobile", dot: "#006B3F" },
];

const MTN_TYPES = ["SME", "SME2", "CORPORATE GIFTING", "GIFTING", "DATA COUPONS", "DATA SHARE"];

type Step = "compose" | "review" | "result";

type OrderResult = {
  status: string;
  reference: string;
  planName: string | null;
  amountKobo: number;
  recipient: string;
  providerMessage: string | null;
  id: string;
};

function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DataPurchase({
  balanceKobo,
  balanceLabel,
  providerReady,
  serviceStatus,
  plans,
}: {
  balanceKobo: number;
  balanceLabel: string;
  providerReady: boolean;
  serviceStatus: string;
  plans: Plan[];
}) {
  const [network, setNetwork] = useState("MTN");
  const [dataType, setDataType] = useState("SME");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [step, setStep] = useState<Step>("compose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);

  const available = useMemo(
    () => plans.filter((plan) => plan.network === network && plan.dataType === dataType),
    [plans, network, dataType],
  );

  const isReference = selected?.source === "REFERENCE";
  const blockedReason = !providerReady
    ? "Live vending is not connected yet. Alrahuz credentials and a confirmed endpoint contract are required before any order can be placed."
    : isReference
      ? "This plan is a reference price, not a verified Alrahuz plan identifier, so it cannot be purchased yet."
      : null;
  const insufficient = selected ? balanceKobo < selected.priceKobo : false;

  function pickNetwork(id: string) {
    setNetwork(id);
    setSelected(null);
    setDataType(id === "MTN" ? "SME" : "");
  }

  async function confirmOrder() {
    if (!selected) return;
    setError(null);
    setBusy(true);
    const key = idempotencyKey ?? newKey();
    setIdempotencyKey(key);
    try {
      const response = await fetch("/api/orders/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network,
          dataType,
          planCode: selected.planCode,
          phone,
          idempotencyKey: key,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "We could not place that order.");
        // A rejected request should not reuse its key for a different payload.
        setIdempotencyKey(null);
        setStep("compose");
        return;
      }

      setResult(payload.order as OrderResult);
      setStep("result");
    } catch {
      setError("Network problem. We did not receive a response — check your transactions before retrying.");
      setIdempotencyKey(key);
      setStep("compose");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!result) return;
    setReconciling(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: result.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "We could not check that order yet.");
        return;
      }
      setResult((current) =>
        current
          ? {
              ...current,
              status: payload.order.status,
              providerMessage: payload.order.providerMessage ?? current.providerMessage,
            }
          : current,
      );
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setReconciling(false);
    }
  }

  function reset() {
    setStep("compose");
    setSelected(null);
    setResult(null);
    setError(null);
    setIdempotencyKey(null);
  }

  if (step === "result" && result) {
    const success = result.status === "SUCCESSFUL";
    const pending = result.status === "PENDING";
    return (
      <div className="mx-auto max-w-[520px]">
        <div className="panel overflow-hidden">
          <div
            className={cn(
              "px-5 py-6 text-center",
              success ? "bg-[#EAF7F0]" : pending ? "bg-[#FBF4E6]" : "bg-[#FDEDEC]",
            )}
          >
            <span
              className={cn(
                "mx-auto grid size-12 place-items-center rounded-full",
                success
                  ? "bg-[#0B7A45] text-white"
                  : pending
                    ? "bg-[#C08A2B] text-white"
                    : "bg-[#C0392B] text-white",
              )}
            >
              {success ? (
                <CheckCircle2 className="size-6" />
              ) : pending ? (
                <Clock3 className="size-6" />
              ) : (
                <XCircle className="size-6" />
              )}
            </span>
            <h1 className="mt-3 text-[18px] font-bold text-ink">
              {success ? "Order successful" : pending ? "Order pending" : "Order failed"}
            </h1>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              {success
                ? "Your bundle is on its way. Keep the reference below."
                : pending
                  ? "The provider has not confirmed yet. We will not resubmit it automatically."
                  : "The provider did not complete this order."}
            </p>
          </div>

          <dl className="divide-y divide-line">
            {[
              ["Reference", result.reference],
              ["Recipient", result.recipient],
              ["Plan", result.planName ?? "—"],
              ["Amount", formatNaira(result.amountKobo, { withDecimals: true })],
              ["Status", result.status],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <dt className="text-[12px] text-ink-muted">{label}</dt>
                <dd className="numeric text-[12.5px] font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {result.providerMessage && (
            <p className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-ink-muted">
              Provider: {result.providerMessage}
            </p>
          )}

          {error && (
            <p className="border-t border-line bg-[#FDEDEC] px-5 py-2.5 text-[11.5px] font-medium text-[#A32B22]">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row">
            {pending && (
              <button
                type="button"
                onClick={reconcile}
                disabled={reconciling}
                className="btn-brand flex-1"
              >
                {reconciling && <Loader2 className="size-4 animate-spin" />}
                {reconciling ? "Checking…" : "Check status"}
              </button>
            )}
            <button type="button" onClick={reset} className="btn-ghost-line flex-1">
              Buy another bundle
            </button>
          </div>
        </div>

        <Link
          href={`/transactions/${result.id}`}
          className="mt-3 flex items-center justify-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
        >
          Open receipt
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  if (step === "review" && selected) {
    return (
      <div className="mx-auto max-w-[520px]">
        <button
          type="button"
          onClick={() => setStep("compose")}
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Edit order
        </button>

        <div className="panel p-5">
          <h1 className="text-[17px] font-bold">Review your order</h1>
          <p className="mt-1 text-[12px] text-ink-muted">
            Check the number and plan. Once confirmed, the amount is taken from your wallet.
          </p>

          <dl className="mt-4 space-y-2.5">
            {[
              ["Network", `${network} · ${dataType}`],
              ["Plan", `${selected.name} · ${selected.validity}`],
              ["Recipient", phone],
              ["Price", formatNaira(selected.priceKobo, { withDecimals: true })],
              ["Wallet balance", balanceLabel],
              ["Balance after", formatNaira(Math.max(balanceKobo - selected.priceKobo, 0), { withDecimals: true })],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-[12.5px] text-ink-muted">{label}</dt>
                <dd className="numeric text-[12.5px] font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-xl bg-secondary/70 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-muted">
            We submit your order to the provider exactly once. If the provider times out, the order stays
            pending and is reconciled before any retry or refund.
          </div>

          {blockedReason && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#F3E2C0] bg-[#FBF4E6] px-3.5 py-2.5 text-[11.5px] font-medium text-[#6B4A10]">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              {blockedReason}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[11.5px] font-medium text-[#A32B22]">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={confirmOrder}
            disabled={busy || Boolean(blockedReason) || insufficient}
            className="btn-brand mt-4 w-full"
            aria-busy={busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {insufficient
              ? "Insufficient wallet balance"
              : busy
                ? "Placing order…"
                : `Pay ${formatNaira(selected.priceKobo, { withDecimals: true })}`}
          </button>
          {insufficient && (
            <Link
              href="/wallet/fund"
              className="mt-2 block text-center text-[12px] font-semibold text-brand hover:underline"
            >
              Add money to your wallet
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold sm:text-[24px]">Buy data</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Balance {balanceLabel} · prices shown before you pay
          </p>
        </div>
        <Link
          href="/wallet/fund"
          className="inline-flex h-9 items-center rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-brand"
        >
          Add money
        </Link>
      </div>

      {(!providerReady || serviceStatus !== "ENABLED") && (
        <div className="panel flex items-start gap-2.5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#8A5B12]" />
          <div>
            <p className="text-[12.5px] font-semibold text-ink">
              {serviceStatus !== "ENABLED" ? "Data is not switched on yet" : "Live vending is not connected"}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
              You can browse the catalogue below, but no order can be placed and your wallet cannot be
              charged.{" "}
              <Link href="/provider-status" className="font-semibold text-brand hover:underline">
                See what is required
              </Link>
            </p>
          </div>
        </div>
      )}

      <section className="panel p-4">
        <p className="section-label">1 · Network</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {NETWORKS.map((item) => {
            const active = network === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pickNetwork(item.id)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[12px] font-semibold transition-colors",
                  active
                    ? "border-brand bg-brand-tint text-brand"
                    : "border-line bg-white text-ink hover:border-brand/30",
                )}
              >
                <span
                  className="size-5 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: item.dot }}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel p-4">
        <p className="section-label">2 · Data type</p>
        {network === "MTN" ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MTN_TYPES.map((type) => {
              const active = dataType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setDataType(type);
                    setSelected(null);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-ink-muted hover:border-brand/30 hover:text-ink",
                  )}
                >
                  {type}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            {network} data types and plan identifiers have not been verified with the provider yet, so no
            plans are offered. They appear automatically once the provider catalogue is synced.
          </p>
        )}
      </section>

      <section className="panel p-4">
        <div className="flex items-end justify-between">
          <p className="section-label">3 · Recipient</p>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/[^\d+]/g, "").slice(0, 14))}
            inputMode="tel"
            placeholder="08031234567"
            aria-label="Recipient phone number"
            className="app-input flex-1"
          />
          <button
            type="button"
            onClick={() => setPhone("")}
            className="btn-ghost-line shrink-0 px-3"
            aria-label="Clear phone number"
          >
            Clear
          </button>
        </div>
        <p className="field-hint">The bundle is delivered to this number. Check it before you pay.</p>
      </section>

      <section className="panel p-4">
        <div className="flex items-end justify-between">
          <p className="section-label">4 · Choose a plan</p>
          {available.some((plan) => plan.source === "REFERENCE") && (
            <span className="chip">Reference pricing</span>
          )}
        </div>

        {available.length === 0 ? (
          <div className="empty-state mt-3">
            <p className="text-[13px] font-semibold">No verified plans here yet</p>
            <p className="mt-1 max-w-[38ch] text-[11.5px] leading-relaxed text-ink-muted">
              Plans for {network} {dataType || ""} have not been confirmed against the provider. Nothing is
              sold until identifiers and live prices are verified.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {available.map((plan) => {
              const active = selected?.planCode === plan.planCode;
              return (
                <button
                  key={plan.planCode}
                  type="button"
                  onClick={() => setSelected(plan)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    active ? "border-brand bg-brand-tint/60" : "border-line bg-white hover:border-brand/30",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[14px] font-bold text-ink">{plan.name}</span>
                    {active && <Check className="size-4 text-brand" />}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted">{plan.validity}</span>
                  <span className="numeric mt-1.5 block text-[13.5px] font-semibold text-brand">
                    {formatNaira(plan.priceKobo)}
                  </span>
                  {plan.source === "REFERENCE" && (
                    <span className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                      Reference
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {available.some((plan) => plan.source === "REFERENCE") && (
          <p className="mt-3 rounded-xl bg-secondary/70 px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
            These MTN SME prices were supplied by the account owner. They are reference prices, not live
            Alrahuz pricing, and can only be purchased after the provider plans are verified and synced.
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[12px] font-medium text-[#A32B22]">
          {error}
        </p>
      )}

      <div className="sticky bottom-[72px] z-20 md:bottom-4">
        <button
          type="button"
          onClick={() => setStep("review")}
          disabled={!selected || phone.replace(/\D/g, "").length < 10}
          className="btn-brand w-full shadow-[0_-6px_24px_-12px_rgba(23,33,29,0.35)]"
        >
          Continue
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
