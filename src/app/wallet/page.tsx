import React from 'react';

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Info, Lock, Wallet as WalletIcon } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/transactions";
import { WalletCard } from "@/components/wallet-card";
import { requireUser } from "@/lib/auth";
import { isPaystackReady, paystackHealth } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatNaira } from "@/lib/money";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await requireUser();

  let entries: Array<{
    id: string;
    direction: "CREDIT" | "DEBIT";
    type: string;
    amountKobo: number;
    balanceAfterKobo: number;
    narration: string;
    reference: string;
    createdAt: Date;
  }> = [];
  let loadFailed = false;

  try {
    entries = await prisma.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        direction: true,
        type: true,
        amountKobo: true,
        balanceAfterKobo: true,
        narration: true,
        reference: true,
        createdAt: true,
      },
    });
  } catch (error) {
    console.error("[wallet] ledger read failed", error instanceof Error ? error.message : error);
    loadFailed = true;
  }

  const paymentsReady = isPaystackReady();
  const missing = paystackHealth().missing;

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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div>
            <h1 className="text-[20px] font-bold sm:text-[24px]">Wallet</h1>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Balance is stored in kobo and backed by an append-only ledger.
            </p>
          </div>

          <WalletCard balanceKobo={user.balanceKobo} fullName={user.fullName} />

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold">Wallet ledger</h2>
              <span className="chip">
                <Lock className="size-3 text-brand" /> Read-only
              </span>
            </div>

            {loadFailed ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[12.5px] font-semibold">We could not load your ledger</p>
                <p className="mt-1 text-[11.5px] text-ink-muted">
                  The database did not respond. Nothing was changed.
                </p>
                <Link href="/wallet" className="mt-2 inline-block text-[12px] font-semibold text-brand">
                  Retry
                </Link>
              </div>
            ) : entries.length === 0 ? (
              <div className="empty-state m-4 border-0 bg-transparent">
                <span className="grid size-11 place-items-center rounded-full bg-brand-tint text-brand">
                  <WalletIcon className="size-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold">Your ledger is empty</p>
                <p className="mt-1 max-w-[34ch] text-[11.5px] leading-relaxed text-ink-muted">
                  Wallet funding and purchases will be posted here with a running balance.
                </p>
                <Link
                  href="/wallet/fund"
                  className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white"
                >
                  Add money
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {entries.map((entry) => {
                  const credit = entry.direction === "CREDIT";
                  return (
                    <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={
                          credit
                            ? "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#EAF7F0] text-[#0B7A45]"
                            : "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#F1F3F2] text-ink-muted"
                        }
                      >
                        {credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[12.5px] font-semibold text-ink">{entry.narration}</p>
                          <p
                            className={
                              credit
                                ? "numeric shrink-0 text-[12.5px] font-semibold text-[#0B7A45]"
                                : "numeric shrink-0 text-[12.5px] font-semibold text-ink"
                            }
                          >
                            {credit ? "+" : "−"}
                            {formatNaira(entry.amountKobo, { withDecimals: true })}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {formatDateTime(entry.createdAt)} · balance{" "}
                          {formatNaira(entry.balanceAfterKobo, { withDecimals: true })}
                        </p>
                        <p className="mt-0.5 truncate text-[10.5px] text-ink-muted/80">{entry.reference}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <p className="section-label">Add money</p>
            {paymentsReady ? (
              <>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                  Fund with Paystack. Your wallet is credited only after the server verifies the payment.
                </p>
                <Link href="/wallet/fund" className="btn-brand mt-3 w-full">
                  Fund wallet
                </Link>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                  Funding is not live yet. A payment gateway must be configured before any money can be
                  added — we will not invent a deposit.
                </p>
                <ul className="mt-2 space-y-1">
                  {missing.map((key) => (
                    <li key={key} className="rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-ink-muted">
                      {key} <span className="text-ink-muted/70">— not set</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/provider-status"
                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                >
                  Payment setup guide
                </Link>
              </>
            )}
          </div>

          <div className="panel p-4">
            <p className="section-label">Withdrawals &amp; transfers</p>
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-secondary/60 px-3 py-2.5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
              <p className="text-[11.5px] leading-relaxed text-ink-muted">
                Withdrawals and wallet-to-wallet transfers are intentionally disabled. They need payout
                authorisation, limits and reconciliation that are not implemented or tested — we will not
                show a button that cannot move real money.
              </p>
            </div>
          </div>

          <div className="panel p-4">
            <p className="section-label">Ledger rules</p>
            <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-muted">
              <li>Every entry is inserted, never edited.</li>
              <li>Debits use a conditional balance check, so concurrent orders cannot overspend.</li>
              <li>Each reference is unique — a retry cannot debit or credit twice.</li>
              <li>Refunds are new credit entries that reference the original order.</li>
            </ul>
            <Link href="/transactions" className="mt-3 inline-flex text-[12px] font-semibold text-brand hover:underline">
              View all transactions
            </Link>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
