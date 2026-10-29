import React from 'react';

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { catalogEntry } from "@/lib/catalog";
import { loadServiceStates } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const entry = catalogEntry(slug);
  if (!entry) notFound();

  const states = await loadServiceStates();
  const state = states.find((item) => item.key === entry.key)!;

  // A live service with its own dedicated screen should send users there.
  if (state.status === "ENABLED" && entry.href !== `/services/${slug}`) {
    redirect(entry.href);
  }

  const pending = state.status === "PROVIDER_CONFIG_REQUIRED";

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
          href="/services"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          All services
        </Link>

        <div className="panel overflow-hidden">
          <div className="border-b border-line px-5 py-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-tint text-brand">
              <ShieldCheck className="size-6" />
            </span>
            <h1 className="mt-3 text-[19px] font-bold">{entry.name}</h1>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-ink-muted">
              {entry.description}
            </p>
            <span
              className={
                pending
                  ? "mt-3 inline-block rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2.5 py-1 text-[11px] font-semibold text-[#8A5B12]"
                  : "mt-3 inline-block rounded-full border border-line bg-secondary px-2.5 py-1 text-[11px] font-semibold text-ink-muted"
              }
            >
              {pending ? "Waiting on the provider" : "Coming soon"}
            </span>
          </div>

          <div className="px-5 py-5">
            <p className="section-label">What is still missing</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink">{state.requirement}</p>

            <div className="mt-4 rounded-xl border border-line bg-secondary/60 px-3.5 py-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
                <p className="text-[11.5px] leading-relaxed text-ink-muted">
                  {pending
                    ? "The screen is intentionally not collectable yet: it does not take a payment, a phone number or identity details until the provider contract is confirmed."
                    : "We do not simulate this service. No purchase buttons, no rewards and no identity fields appear until a lawful, documented provider is in place."}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href="/data" className="btn-ghost-line">
                Buy data instead
              </Link>
              <Link href="/wallet" className="btn-ghost-line">
                Go to wallet
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-muted">
          We never ask for crypto seed phrases, private keys, card PINs, BVN or NIN details to enable a
          service that is not live.
        </p>
      </div>
    </AppShell>
  );
}
