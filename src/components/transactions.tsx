import React from 'react';

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; className: string; dot: string }> = {
  SUCCESSFUL: {
    label: "Successful",
    className: "border-[#C9EBD9] bg-[#EAF7F0] text-[#0B7A45]",
    dot: "bg-[#0B7A45]",
  },
  PENDING: {
    label: "Pending",
    className: "border-[#F3E2C0] bg-[#FBF4E6] text-[#8A5B12]",
    dot: "bg-[#C08A2B]",
  },
  FAILED: {
    label: "Failed",
    className: "border-[#F6D3D0] bg-[#FDEDEC] text-[#A32B22]",
    dot: "bg-[#C0392B]",
  },
  REFUNDED: {
    label: "Refunded",
    className: "border-[#D3DCF3] bg-[#EEF2FC] text-[#2C4C9C]",
    dot: "bg-[#3B5BDB]",
  },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS[status] ?? {
    label: status.charAt(0) + status.slice(1).toLowerCase(),
    className: "border-line bg-secondary text-ink-muted",
    dot: "bg-ink-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        meta.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export type TransactionItem = {
  id: string;
  reference: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  amountKobo: number;
  direction: "CREDIT" | "DEBIT";
  status: string;
};

export function TransactionRow({ item }: { item: TransactionItem }) {
  const credit = item.direction === "CREDIT";
  return (
    <Link
      href={`/transactions/${item.id}`}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/60"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full text-[11px] font-bold",
          credit ? "bg-[#EAF7F0] text-[#0B7A45]" : "bg-[#F1F3F2] text-ink-muted",
        )}
        aria-hidden="true"
      >
        {credit ? "IN" : "OUT"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold text-ink">{item.title}</span>
          <span
            className={cn(
              "numeric shrink-0 text-[13.5px] font-semibold",
              credit ? "text-[#0B7A45]" : "text-ink",
            )}
          >
            {credit ? "+" : "−"}
            {formatNaira(item.amountKobo, { withDecimals: true }).replace("₦", "₦")}
          </span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[11.5px] text-ink-muted">
            {item.subtitle} · {item.dateLabel}
          </span>
          <StatusBadge status={item.status} />
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-muted/60" aria-hidden="true" />
    </Link>
  );
}

export function TransactionList({ items }: { items: TransactionItem[] }) {
  return (
    <div className="panel divide-y divide-line overflow-hidden">
      {items.map((item) => (
        <TransactionRow key={item.id} item={item} />
      ))}
    </div>
  );
}
