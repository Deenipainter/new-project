import React from 'react';

import Link from "next/link";
import { Search } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { TransactionList } from "@/components/transactions";
import { requireUser } from "@/lib/auth";
import { formatDateShort } from "@/lib/format";
import { listTransactions } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "ALL", label: "All" },
  { id: "SUCCESSFUL", label: "Successful" },
  { id: "PENDING", label: "Pending" },
  { id: "FAILED", label: "Failed" },
  { id: "REFUNDED", label: "Refunded" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").slice(0, 60);
  const status = FILTERS.some((filter) => filter.id === params.status) ? params.status! : "ALL";

  let items: Awaited<ReturnType<typeof listTransactions>> = [];
  let failed = false;
  try {
    items = await listTransactions(user.id, { query, status, limit: 60 });
  } catch (error) {
    console.error("[transactions] load failed", error instanceof Error ? error.message : error);
    failed = true;
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold sm:text-[24px]">Transactions</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Every wallet movement and order on your account.
          </p>
        </div>
      </div>

      <form method="get" className="mt-4 flex gap-2">
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search reference, plan or number"
            aria-label="Search transactions"
            className="app-input pl-9"
          />
        </div>
        <button type="submit" className="btn-ghost-line shrink-0 px-4">
          Search
        </button>
      </form>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((filter) => {
          const href = `/transactions?${new URLSearchParams({
            ...(query ? { q: query } : {}),
            ...(filter.id !== "ALL" ? { status: filter.id } : {}),
          }).toString()}`;
          const active = status === filter.id;
          return (
            <Link
              key={filter.id}
              href={href}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-ink-muted hover:text-ink",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4">
        {failed ? (
          <div className="empty-state">
            <p className="text-[13px] font-semibold">We could not load your transactions</p>
            <p className="mt-1 text-[11.5px] text-ink-muted">
              The database did not respond. Your records are safe — refresh to try again.
            </p>
            <Link href="/transactions" className="mt-3 text-[12px] font-semibold text-brand">
              Retry
            </Link>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <p className="text-[13px] font-semibold">
              {query || status !== "ALL" ? "No matching transactions" : "No transactions yet"}
            </p>
            <p className="mt-1 max-w-[36ch] text-[11.5px] leading-relaxed text-ink-muted">
              {query || status !== "ALL"
                ? "Try a different search term or clear the filter."
                : "Fund your wallet and place your first order — the receipt will appear here."}
            </p>
            {query || status !== "ALL" ? (
              <Link href="/transactions" className="mt-3 text-[12px] font-semibold text-brand">
                Clear filters
              </Link>
            ) : (
              <Link
                href="/wallet/fund"
                className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white"
              >
                Fund wallet
              </Link>
            )}
          </div>
        ) : (
          <TransactionList
            items={items.map((item) => ({
              id: item.id,
              reference: item.reference,
              title: item.title,
              subtitle: item.subtitle,
              dateLabel: formatDateShort(item.createdAt),
              amountKobo: item.amountKobo,
              direction: item.direction,
              status: item.status,
            }))}
          />
        )}
      </div>
    </AppShell>
  );
}
