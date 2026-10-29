import React from 'react';

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/transactions";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatNaira } from "@/lib/money";
import { findTransaction } from "@/lib/transactions";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const record = await findTransaction(user.id, id);
  if (!record) notFound();

  const rows: Array<[string, string]> = [];
  let title = "";
  let amountKobo = 0;
  let status = "SUCCESSFUL";
  let credit = false;

  if (record.type === "order") {
    const order = record.order;
    title = `${order.network ?? ""} ${order.dataType ?? ""}`.trim() || "Data order";
    amountKobo = order.amountKobo;
    status = order.status;
    rows.push(
      ["Reference", order.reference],
      ["Service", order.serviceType],
      ["Plan", order.planName ?? "—"],
      ["Recipient", order.recipient],
      ["Amount", formatNaira(order.amountKobo, { withDecimals: true })],
      ["Payment method", "Wallet"],
      ["Provider", order.providerName ?? "—"],
      ["Provider reference", order.providerReference ?? "Not issued yet"],
      ["Created", formatDateTime(order.createdAt)],
      ["Last update", formatDateTime(order.updatedAt)],
    );
    if (order.refundedAt) rows.push(["Refunded", formatDateTime(order.refundedAt)]);
    if (order.failureReason) rows.push(["Reason", order.failureReason]);
  } else {
    const entry = record.entry;
    title = entry.narration;
    amountKobo = entry.amountKobo;
    credit = entry.direction === "CREDIT";
    status = entry.type === "REFUND" ? "REFUNDED" : "SUCCESSFUL";
    rows.push(
      ["Reference", entry.reference],
      ["Type", entry.type.replaceAll("_", " ").toLowerCase()],
      ["Amount", formatNaira(entry.amountKobo, { withDecimals: true })],
      ["Balance after", formatNaira(entry.balanceAfterKobo, { withDecimals: true })],
      ["Posted", formatDateTime(entry.createdAt)],
    );
    if (record.relatedOrder?.reference) rows.push(["Related order", record.relatedOrder.reference]);
  }

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        balanceKobo: user.balanceKobo,
      }}
    >
      <div className="mx-auto max-w-[560px]">
        <Link
          href="/transactions"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          All transactions
        </Link>

        <div className="panel overflow-hidden">
          <div className="border-b border-line px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-label">Receipt</p>
                <h1 className="mt-1 text-[16px] font-bold leading-snug">{title}</h1>
              </div>
              <StatusBadge status={status} />
            </div>
            <p className="numeric mt-3 text-[26px] font-bold leading-none">
              <span className={credit ? "text-[#0B7A45]" : "text-ink"}>
                {credit ? "+" : "−"}
                {formatNaira(amountKobo, { withDecimals: true })}
              </span>
            </p>
          </div>

          <dl className="divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-5 py-2.5">
                <dt className="shrink-0 text-[12px] text-ink-muted">{label}</dt>
                <dd className="numeric max-w-[60%] break-words text-right text-[12.5px] font-semibold text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {record.type === "order" && record.order.status === "PENDING" && (
            <div className="flex items-start gap-2 border-t border-line bg-[#FBF4E6] px-5 py-3">
              <Info className="mt-0.5 size-3.5 shrink-0 text-[#8A5B12]" />
              <p className="text-[11.5px] leading-relaxed text-[#6B4A10]">
                This order is pending. It is never resubmitted automatically — open the order from your data
                page to check it with the provider, or contact support with the reference above.
              </p>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-ink-muted">
          Keep this reference for support. Each user can only see their own receipts.
        </p>
      </div>
    </AppShell>
  );
}
