"use client";
import React from 'react';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

async function callAdmin(payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "That action failed.");
  return data;
}

export function AdminActions({
  users,
  services,
  providerReady,
}: {
  users: Array<{ id: string; email: string; fullName: string }>;
  services: Array<{ key: string; name: string; status: string }>;
  providerReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adjust, setAdjust] = useState({ userId: "", direction: "CREDIT", amount: "", reason: "" });
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [serviceKey, setServiceKey] = useState(services[0]?.key ?? "data");
  const [serviceStatus, setServiceStatus] = useState(services[0]?.status ?? "ENABLED");

  async function run(key: string, payload: Record<string, unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const data = await callAdmin(payload);
      setMessage(typeof data.message === "string" ? data.message : success);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action failed.");
    } finally {
      setBusy(null);
    }
  }

  const naira = Number(adjust.amount.replace(/[^\d.]/g, ""));
  const amountKobo = Number.isFinite(naira) ? Math.round(naira * 100) : 0;

  return (
    <div className="space-y-4">
      {(message || error) && (
        <p
          className={
            error
              ? "rounded-xl border border-[#F6D3D0] bg-[#FDEDEC] px-3.5 py-2.5 text-[12px] font-medium text-[#A32B22]"
              : "rounded-xl border border-[#C9EBD9] bg-[#EAF7F0] px-3.5 py-2.5 text-[12px] font-medium text-[#0B7A45]"
          }
        >
          {error ?? message}
        </p>
      )}

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Pending order reconciliation</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Checks the provider for an order reference. It never re-submits the purchase.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="Order ID"
            className="app-input flex-1"
            aria-label="Order ID to reconcile"
          />
          <button
            type="button"
            disabled={!orderId || busy === "reconcile"}
            onClick={() => run("reconcile", { action: "reconcile", orderId }, "Order checked.")}
            className="btn-ghost-line shrink-0"
          >
            {busy === "reconcile" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Check provider
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Refund an order</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Credits the wallet exactly once with a ledger entry linked to the order, and writes an audit row.
        </p>
        <div className="mt-3 space-y-2">
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="Order ID"
            className="app-input"
            aria-label="Order ID to refund"
          />
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (required for the audit trail)"
            className="app-input"
            aria-label="Refund reason"
          />
          <button
            type="button"
            disabled={!orderId || reason.trim().length < 4 || busy === "refund"}
            onClick={() => run("refund", { action: "refund", orderId, reason }, "Refund recorded.")}
            className="btn-brand"
          >
            {busy === "refund" && <Loader2 className="size-4 animate-spin" />}
            Record refund
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Audited balance adjustment</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          For support corrections only. Every adjustment is ledger-backed and attributed to your admin
          account.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            value={adjust.userId}
            onChange={(event) => setAdjust({ ...adjust, userId: event.target.value })}
            className="app-input sm:col-span-2"
            aria-label="Target user"
          >
            <option value="">Select a user…</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} · {user.email}
              </option>
            ))}
          </select>
          <select
            value={adjust.direction}
            onChange={(event) => setAdjust({ ...adjust, direction: event.target.value })}
            className="app-input"
            aria-label="Direction"
          >
            <option value="CREDIT">Credit</option>
            <option value="DEBIT">Debit</option>
          </select>
          <input
            value={adjust.amount}
            onChange={(event) => setAdjust({ ...adjust, amount: event.target.value.replace(/[^\d.]/g, "") })}
            placeholder="Amount (₦)"
            inputMode="decimal"
            className="app-input"
            aria-label="Adjustment amount in naira"
          />
          <input
            value={adjust.reason}
            onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })}
            placeholder="Reason (required)"
            className="app-input sm:col-span-2"
            aria-label="Adjustment reason"
          />
          <button
            type="button"
            disabled={!adjust.userId || amountKobo <= 0 || adjust.reason.trim().length < 4 || busy === "adjustment"}
            onClick={() =>
              run(
                "adjustment",
                {
                  action: "adjustment",
                  userId: adjust.userId,
                  direction: adjust.direction,
                  amountKobo,
                  reason: adjust.reason,
                },
                "Adjustment posted.",
              )
            }
            className="btn-brand sm:col-span-2"
          >
            {busy === "adjustment" && <Loader2 className="size-4 animate-spin" />}
            Post adjustment
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Service availability</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Flip a service to enabled only when its provider contract is verified and tested.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={serviceKey}
            onChange={(event) => {
              setServiceKey(event.target.value);
              const found = services.find((service) => service.key === event.target.value);
              if (found) setServiceStatus(found.status);
            }}
            className="app-input"
            aria-label="Service"
          >
            {services.map((service) => (
              <option key={service.key} value={service.key}>
                {service.name}
              </option>
            ))}
          </select>
          <select
            value={serviceStatus}
            onChange={(event) => setServiceStatus(event.target.value)}
            className="app-input"
            aria-label="Service status"
          >
            <option value="ENABLED">Enabled</option>
            <option value="PROVIDER_CONFIG_REQUIRED">Provider pending</option>
            <option value="COMING_SOON">Coming soon</option>
          </select>
          <button
            type="button"
            disabled={busy === "status"}
            onClick={() =>
              run(
                "status",
                { action: "set-service-status", serviceKey, status: serviceStatus },
                "Service status updated.",
              )
            }
            className="btn-ghost-line"
          >
            {busy === "status" && <Loader2 className="size-4 animate-spin" />}
            Save
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-[14px] font-semibold">Provider catalogue</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
          Imports live Alrahuz plans and prices. Reference prices are never overwritten silently — provider
          rows are stored with their own identifiers.
        </p>
        <button
          type="button"
          disabled={!providerReady || busy === "sync"}
          onClick={() => run("sync", { action: "sync-plans" }, "Plans synced.")}
          className="btn-ghost-line mt-3"
        >
          {busy === "sync" && <Loader2 className="size-4 animate-spin" />}
          {providerReady ? "Sync live plans" : "Provider not configured"}
        </button>
      </section>
    </div>
  );
}
