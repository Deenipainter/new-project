import React from 'react';

import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Clock3,
  LayoutGrid,
  Smartphone,
  TrendingUp,
  Wifi,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Landing } from "@/components/landing";
import { ReferralCard } from "@/components/referral-card";
import { ServiceGrid } from "@/components/service-grid";
import { TransactionList } from "@/components/transactions";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { WalletCard } from "@/components/wallet-card";
import { getCurrentUser } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { formatDateShort, relativeToday } from "@/lib/format";
import { loadServiceStates } from "@/lib/services";

export const dynamic = "force-dynamic";

const QUICK = [
  { href: "/data", label: "Buy Data", icon: Wifi, hint: "All networks" },
  { href: "/services/airtime", label: "Airtime", icon: Smartphone, hint: "Top up fast" },
  { href: "/transactions", label: "History", icon: LayoutGrid, hint: "Receipts" },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    const services = await loadServiceStates();
    return <Landing services={services} />;
  }

  const data = await loadDashboard(user.id, user.referralCode);
  const firstName = user.fullName.split(" ")[0] ?? "there";
  const mainServices = data.services.filter((service) => service.key !== "more").slice(0, 11);
  const tiles = mainServices.map((service) => ({
    key: service.key,
    name: service.name,
    short: service.short,
    href: service.href,
    icon: service.icon,
    status: service.status,
  }));
  tiles.push({
    key: "more",
    name: "More Services",
    short: "More",
    href: "/services",
    icon: "more",
    status: "ENABLED",
  });

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
      {!user.emailVerifiedAt && <VerifyEmailBanner />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-bold sm:text-[24px]">Hi, {firstName}</h1>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">{relativeToday(new Date())}</p>
            </div>
            {data.pendingOrders > 0 && (
              <Link
                href="/transactions?status=PENDING"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2.5 py-1 text-[11px] font-semibold text-[#8A5B12]"
              >
                <Clock3 className="size-3" />
                {data.pendingOrders} pending
              </Link>
            )}
          </div>

          <WalletCard balanceKobo={user.balanceKobo} fullName={user.fullName} />

          <div className="grid grid-cols-3 gap-2.5">
            {QUICK.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="panel flex flex-col gap-2 px-3 py-3.5 transition-colors hover:border-brand/30"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-brand-tint text-brand">
                  <action.icon className="size-4" strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-[12.5px] font-semibold leading-tight text-ink">
                    {action.label}
                  </span>
                  <span className="block text-[11px] text-ink-muted">{action.hint}</span>
                </span>
              </Link>
            ))}
          </div>

          {!data.providers.alrahuz && (
            <div className="rounded-[16px] border border-line bg-white px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#FBF4E6] text-[#8A5B12]">
                  <Clock3 className="size-3.5" />
                </span>
                <div>
                  <p className="text-[12.5px] font-semibold text-ink">
                    Live vending is not connected yet
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                    Alrahuz credentials and endpoint confirmation are still required, so no order can be
                    placed and no money can be taken. Your wallet is ready for when it goes live.
                  </p>
                  <Link
                    href="/provider-status"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
                  >
                    See what is left to activate
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">Services</h2>
              <Link href="/services" className="text-[11.5px] font-semibold text-brand hover:underline">
                See all
              </Link>
            </div>
            <ServiceGrid items={tiles} />
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold">Recent transactions</h2>
              <Link href="/transactions" className="text-[11.5px] font-semibold text-brand hover:underline">
                View all
              </Link>
            </div>
            {!data.ok ? (
              <div className="px-4 py-6 text-center">
                <p className="text-[12.5px] font-medium text-ink">We could not load your activity</p>
                <p className="mt-1 text-[11.5px] text-ink-muted">
                  The database did not respond. Refresh the page to try again — nothing was lost.
                </p>
                <Link href="/transactions" className="mt-2 inline-block text-[12px] font-semibold text-brand">
                  Retry
                </Link>
              </div>
            ) : data.transactions.length === 0 ? (
              <div className="empty-state m-4 border-0 bg-transparent">
                <span className="grid size-11 place-items-center rounded-full bg-brand-tint text-brand">
                  <TrendingUp className="size-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold">No activity yet</p>
                <p className="mt-1 max-w-[34ch] text-[11.5px] leading-relaxed text-ink-muted">
                  Fund your wallet, then buy data or airtime. Every transaction will show here with its
                  own reference.
                </p>
                <Link
                  href="/wallet/fund"
                  className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[12.5px] font-semibold text-white"
                >
                  Add money
                </Link>
              </div>
            ) : (
              <TransactionList
                items={data.transactions.map((item) => ({
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
          </section>
        </div>

        <aside className="space-y-4">
          <ReferralCard
            code={data.referral.code}
            total={data.referral.total}
            qualified={data.referral.qualified}
          />

          {data.announcements.length > 0 ? (
            <div className="panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <BellRing className="size-4 text-brand" />
                <h2 className="text-[13.5px] font-semibold">Announcements</h2>
              </div>
              <ul className="space-y-3">
                {data.announcements.map((note) => (
                  <li key={note.id} className="rounded-xl bg-secondary/70 px-3 py-2.5">
                    <p className="text-[12.5px] font-semibold text-ink">{note.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{note.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <BellRing className="size-4 text-brand" />
                <h2 className="text-[13.5px] font-semibold">Announcements</h2>
              </div>
              <p className="text-[11.5px] leading-relaxed text-ink-muted">
                Nothing to announce right now. Provider updates and new services will appear here.
              </p>
            </div>
          )}

          <div className="panel p-4">
            <p className="section-label">Need help?</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
              Send your transaction reference to support and we can trace it in the ledger.
            </p>
            <Link
              href="/support"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
            >
              Contact support
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
