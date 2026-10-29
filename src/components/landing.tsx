import React from 'react';

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Lock,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import { BrandLockup, LogoMark } from "@/components/brand";
import { ServiceGrid } from "@/components/service-grid";
import { APP_TAGLINE } from "@/lib/config";
import { formatNaira } from "@/lib/money";
import type { ServiceState } from "@/lib/catalog";

const PILLARS = [
  {
    icon: Wallet,
    title: "One wallet, real records",
    body: "Every credit and debit is written to an append-only ledger, so your balance always has a paper trail.",
  },
  {
    icon: ReceiptText,
    title: "Receipts for every order",
    body: "Each purchase gets a reference you can search, share with support, and reconcile end to end.",
  },
  {
    icon: Lock,
    title: "Server-side by design",
    body: "Prices, balances and provider calls are handled on the server. Your browser never holds a secret.",
  },
];

export function Landing({ services }: { services: ServiceState[] }) {
  const live = services.filter((service) => service.status === "ENABLED");
  const preview = services.slice(0, 8).map((service) => ({
    key: service.key,
    name: service.name,
    short: service.short,
    href: "/register",
    icon: service.icon,
    status: service.status,
  }));

  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-page/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLockup />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-xl px-3 text-[13.5px] font-semibold text-ink transition-colors hover:bg-white"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              Create account
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-semibold text-ink-muted">
                <span className="size-1.5 rounded-full bg-brand-accent" aria-hidden="true" />
                Made for Nigeria · Naira (₦)
              </span>

              <h1 className="mt-5 text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
                {APP_TAGLINE.replace("Your Data, Your Way.", "Your data,")}
                <br />
                <span className="text-brand">your way.</span>
              </h1>

              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted sm:text-[16px]">
                Top up data and airtime from one secure wallet. Clear prices before you pay, a receipt
                after every order, and a ledger you can audit yourself.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(8,127,91,0.9)] transition-colors hover:bg-brand-dark"
                >
                  Get started free
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center rounded-xl border border-line bg-white px-5 text-[15px] font-semibold text-ink transition-colors hover:border-brand/30"
                >
                  I already have an account
                </Link>
              </div>

              <dl className="mt-9 grid grid-cols-3 gap-3 border-t border-line pt-6">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Wallet</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-ink">Ledger-backed</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Receipts</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-ink">Every order</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Support</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-ink">Human, in-app</dd>
                </div>
              </dl>
            </div>

            {/* Product preview — a real zero-state wallet, no invented transactions */}
            <div className="relative">
              <div className="wallet-surface rounded-[22px] p-5 text-white shadow-[0_30px_60px_-32px_rgba(6,102,74,0.85)]">
                <div className="relative z-10">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/70">
                    Wallet balance
                  </p>
                  <p className="numeric mt-1 text-[32px] font-bold leading-none">
                    {formatNaira(0, { withDecimals: true })}
                  </p>
                  <p className="mt-2 text-[12.5px] text-white/70">
                    Fund once, then pay for every service from here.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3.5 text-[12.5px] font-semibold text-brand-dark">
                      <Wallet className="size-3.5" /> Add money
                    </span>
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/30 px-3.5 text-[12.5px] font-medium text-white">
                      <Smartphone className="size-3.5" /> Buy data
                    </span>
                  </div>
                </div>
              </div>

              <div className="panel relative z-10 -mt-4 ml-3 mr-1 px-4 py-4 sm:ml-6">
                <div className="flex items-center justify-between">
                  <p className="section-label">Services</p>
                  <span className="chip">
                    <BadgeCheck className="size-3 text-brand" />
                    {live.length} live
                  </span>
                </div>
                <div className="mt-3">
                  <ServiceGrid items={preview} />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <ShieldCheck className="size-3.5 text-brand" />
                  Services appear here as soon as their provider is verified.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="panel p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand">
                  <pillar.icon className="size-[18px]" strokeWidth={1.9} />
                </span>
                <h2 className="mt-4 text-[15px] font-semibold">{pillar.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{pillar.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="section-label">Service directory</p>
                <h2 className="mt-1 text-[20px] font-bold">What you can do today</h2>
              </div>
              <Link href="/register" className="text-[13px] font-semibold text-brand hover:underline">
                Create an account to start
              </Link>
            </div>
            <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <li key={service.key} className="bg-white px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[13.5px] font-semibold">{service.name}</h3>
                    <span
                      className={
                        service.status === "ENABLED"
                          ? "rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B7A45]"
                          : "rounded-full border border-line bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-ink-muted"
                      }
                    >
                      {service.status === "ENABLED"
                        ? "Available"
                        : service.status === "PROVIDER_CONFIG_REQUIRED"
                          ? "Provider pending"
                          : "Coming soon"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{service.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer className="border-t border-line bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <div>
                <p className="text-[13px] font-semibold">DP Data Sub</p>
                <p className="text-[11.5px] text-ink-muted">{APP_TAGLINE}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-[12.5px] font-medium text-ink-muted">
              <Link href="/login" className="hover:text-ink">
                Sign in
              </Link>
              <Link href="/register" className="hover:text-ink">
                Create account
              </Link>
              <Link href="/support" className="hover:text-ink">
                Support
              </Link>
              <Link href="/privacy" className="hover:text-ink">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
