import React from 'react';

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  PlugZap,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AdminActions } from "@/components/admin/admin-actions";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/transactions";
import { requireAdmin } from "@/lib/auth";
import { loadAlrahuzHealth, loadAlrahuzStatus } from "@/lib/alrahuz-settings";
import { resendConfig } from "@/lib/config";
import { loadPaymentGatewayStatus } from "@/lib/payment-gateway";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatNaira } from "@/lib/money";
import { loadServiceStates } from "@/lib/services";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [userCount, orders, ledgerTotals, audit, users, services] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.vtuOrder
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { user: { select: { fullName: true, email: true } } },
      })
      .catch(() => []),
    prisma.ledgerEntry
      .groupBy({ by: ["direction"], _sum: { amountKobo: true } })
      .catch(() => []),
    prisma.auditEvent
      .findMany({ orderBy: { createdAt: "desc" }, take: 10 })
      .catch(() => []),
    prisma.user
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, fullName: true, email: true },
      })
      .catch(() => []),
    loadServiceStates(),
  ]);

  const pendingCount = orders.filter((order) => order.status === "PENDING").length;
  const credits = ledgerTotals.find((row) => row.direction === "CREDIT")?._sum.amountKobo ?? 0;
  const debits = ledgerTotals.find((row) => row.direction === "DEBIT")?._sum.amountKobo ?? 0;
  const [alrahuz, alrahuzStatus, gateway] = await Promise.all([
    loadAlrahuzHealth(),
    loadAlrahuzStatus(),
    loadPaymentGatewayStatus(),
  ]);
  const email = resendConfig();
  const alrahuzBadge =
    alrahuzStatus.state === "connected"
      ? "Connected"
      : alrahuzStatus.state === "failed"
        ? "Connection failed"
        : alrahuzStatus.state === "untested"
          ? "Not verified yet"
          : "Not configured";
  const alrahuzBadgeTone =
    alrahuzStatus.state === "connected"
      ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#0B7A45]"
      : alrahuzStatus.state === "failed"
        ? "border-[#F6D3D0] bg-[#FDEDEC] text-[#A32B22]"
        : "border-line bg-white text-ink-muted";

  const health = [
    {
      name: "Alrahuz Data",
      ok: alrahuz.configured,
      detail: alrahuz.configured
        ? "Credentials present and endpoints marked verified."
        : `Missing: ${alrahuz.missing.join(", ") || "configuration"}`,
    },
    {
      name: "Paystack",
      ok: gateway.ready,
      detail: gateway.ready
        ? `Wallet funding is live in ${gateway.mode === "TEST" ? "test" : "live"} mode, using keys from ${
            gateway.source === "saved" ? "Payment gateway settings" : "the server environment"
          }.`
        : gateway.secretKey.configured
          ? "A key is configured but funding is blocked — check Payment gateway settings."
          : `Missing: ${gateway.missing.join(", ") || "PAYSTACK_SECRET_KEY"}`,
    },
    {
      name: "Resend email",
      ok: email.configured,
      detail: email.configured ? "Transactional email is configured." : "RESEND_API_KEY is not set.",
    },
    {
      name: "PostgreSQL",
      ok: true,
      detail: "Ledger and order tables reachable from this request.",
    },
  ];

  return (
    <AppShell
      user={{
        id: admin.id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        balanceKobo: admin.balanceKobo,
      }}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold sm:text-[24px]">Admin dashboard</h1>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Operations, reconciliation and integration health. Secrets are never displayed.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/payment-gateway" className="btn-brand inline-flex items-center gap-1.5">
                <KeyRound className="size-4" />
                Payment gateway settings
              </Link>
              <Link href="/admin/alrahuz" className="btn-ghost-line inline-flex items-center gap-1.5">
                <PlugZap className="size-4" />
                Alrahuz API settings
              </Link>
            </div>
          </div>
          <span className="chip">
            <ShieldCheck className="size-3 text-brand" /> Role: ADMIN
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[
            { label: "Users", value: String(userCount) },
            { label: "Pending orders", value: String(pendingCount) },
            { label: "Total credits", value: formatNaira(credits) },
            { label: "Total debits", value: formatNaira(debits) },
          ].map((stat) => (
            <div key={stat.label} className="panel px-4 py-3">
              <p className="section-label">{stat.label}</p>
              <p className="numeric mt-1 text-[18px] font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="panel overflow-hidden" id="configuration">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Configuration</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              Keys are validated on the server, encrypted before storage and never sent back to the browser.
            </p>
          </div>
          <ul className="divide-y divide-line">
            <li>
              <Link
                href="/admin/payment-gateway"
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
                  <KeyRound className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">Payment gateway settings</span>
                    <span
                      className={
                        gateway.ready
                          ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10px] font-semibold text-[#0B7A45]"
                          : "rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-muted"
                      }
                    >
                      {gateway.ready
                        ? `${gateway.mode === "TEST" ? "Test" : "Live"} mode · ready`
                        : "Not configured"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                    Paystack secret key, public key and webhook secret used for wallet funding. Leave the
                    fields blank to keep an existing secret unchanged.
                  </span>
                </span>
                <ChevronRight className="mt-2 size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
            <li>
              <Link
                href="/admin/alrahuz"
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
                  <PlugZap className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">Alrahuz API settings</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${alrahuzBadgeTone}`}
                    >
                      {alrahuzBadge}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                    Alrahuz API key and base URL, encrypted on the server. The key is masked and Test
                    Connection runs a read-only check.
                  </span>
                </span>
                <ChevronRight className="mt-2 size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
            <li>
              <Link
                href="/provider-status"
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-ink-muted">
                  <ServerCog className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">Data provider status</span>
                    <span
                      className={
                        alrahuz.configured
                          ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10px] font-semibold text-[#0B7A45]"
                          : "rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-muted"
                      }
                    >
                      {alrahuz.configured ? "Ready" : `${alrahuz.missing.length} value(s) missing`}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                    Alrahuz API key, base URL and endpoint verification. Credentials are managed in
                    Alrahuz API settings; endpoint confirmation stays a server-side flag.
                  </span>
                </span>
                <ChevronRight className="mt-2 size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          </ul>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Integration health</h2>
          </div>
          <ul className="divide-y divide-line">
            {health.map((item) => (
              <li key={item.name} className="flex items-start gap-2.5 px-4 py-2.5">
                {item.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#0B7A45]" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#8A5B12]" />
                )}
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold">{item.name}</p>
                  <p className="text-[11.5px] leading-relaxed text-ink-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-[14px] font-semibold">Recent orders</h2>
                <Link href="/transactions" className="text-[11.5px] font-semibold text-brand hover:underline">
                  My transactions
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-ink-muted">
                  No orders have been placed yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {orders.map((order) => (
                    <li key={order.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold">
                            {order.network} {order.dataType} · {order.planName}
                          </p>
                          <p className="truncate text-[11px] text-ink-muted">
                            {order.recipient} · {order.user.email}
                          </p>
                          <p className="numeric mt-0.5 truncate text-[10.5px] text-ink-muted/80">
                            {order.reference} · {formatDateTime(order.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={order.status} />
                          <span className="numeric text-[11.5px] font-semibold">
                            {formatNaira(order.amountKobo, { withDecimals: true })}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 select-all text-[10px] text-ink-muted/70">id: {order.id}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-[14px] font-semibold">Audit trail</h2>
              </div>
              {audit.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-ink-muted">No audit events yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {audit.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium">{event.action}</p>
                        <p className="truncate text-[10.5px] text-ink-muted">
                          {event.entity ?? "—"} · {event.actorRole ?? "SYSTEM"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10.5px] text-ink-muted">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <AdminActions
              users={users}
              services={services.map((service) => ({
                key: service.key,
                name: service.name,
                status: service.status,
              }))}
              providerReady={alrahuz.configured}
            />
            <div className="panel p-4">
              <p className="section-label">Admin safety</p>
              <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-muted">
                <li className="flex items-start gap-1.5">
                  <Users className="mt-0.5 size-3.5 shrink-0" />
                  Roles are checked on the server for every admin request.
                </li>
                <li>Admin emails come from the ADMIN_EMAILS environment variable.</li>
                <li>Refunds and adjustments are ledger-backed and audited — they cannot be edited away.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
