import React from 'react';

import Link from "next/link";
import { BadgeCheck, ShieldQuestion, Wallet } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ProfileForms } from "@/components/profile/profile-forms";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatNaira } from "@/lib/money";
import { prisma } from "@/lib/db";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const record = await prisma.user
    .findUnique({
      where: { id: user.id },
      select: { createdAt: true, emailVerifiedAt: true, role: true },
    })
    .catch(() => null);

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
      <div className="mx-auto max-w-[640px] space-y-4">
        <div>
          <h1 className="text-[20px] font-bold sm:text-[24px]">Profile</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">Your account, security and support.</p>
        </div>

        <section className="panel p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-brand-tint text-[15px] font-bold text-brand">
              {user.fullName
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{user.fullName}</p>
              <p className="truncate text-[12px] text-ink-muted">{user.email}</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-secondary/70 px-3 py-2.5">
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Wallet balance
              </dt>
              <dd className="numeric mt-0.5 text-[14px] font-semibold">
                {formatNaira(user.balanceKobo, { withDecimals: true })}
              </dd>
            </div>
            <div className="rounded-xl bg-secondary/70 px-3 py-2.5">
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Email status
              </dt>
              <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold">
                {record?.emailVerifiedAt ? (
                  <>
                    <BadgeCheck className="size-4 text-brand" /> Verified
                  </>
                ) : (
                  <>
                    <ShieldQuestion className="size-4 text-[#8A5B12]" /> Not verified
                  </>
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-secondary/70 px-3 py-2.5">
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Referral code
              </dt>
              <dd className="numeric mt-0.5 text-[13px] font-semibold">{user.referralCode}</dd>
            </div>
            <div className="rounded-xl bg-secondary/70 px-3 py-2.5">
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Member since
              </dt>
              <dd className="mt-0.5 text-[13px] font-semibold">
                {record ? formatDateTime(record.createdAt) : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <ProfileForms fullName={user.fullName} phone={user.phone} email={user.email} />

        <section className="panel p-4">
          <h2 className="text-[14px] font-semibold">Account &amp; support</h2>
          <ul className="mt-2 divide-y divide-line">
            {[
              { href: "/referrals", label: "My referrals", icon: Wallet },
              { href: "/provider-status", label: "Service & payment status", icon: BadgeCheck },
              { href: "/support", label: "Support", icon: ShieldQuestion },
              { href: "/privacy", label: "Privacy notice", icon: ShieldQuestion },
              { href: "/terms", label: "Terms of service", icon: ShieldQuestion },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-2 py-2.5 text-[12.5px] font-medium text-ink hover:text-brand"
                >
                  {item.label}
                  <span aria-hidden="true" className="text-ink-muted">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {user.role === "ADMIN" && (
            <p className="mt-3 rounded-xl bg-brand-tint px-3 py-2 text-[11.5px] font-medium text-brand">
              You have administrator access.{" "}
              <Link href="/admin" className="underline">
                Open admin dashboard
              </Link>
            </p>
          )}
        </section>

        <p className="text-center text-[11px] leading-relaxed text-ink-muted">
          DP Data Sub never asks for your card PIN, BVN, NIN, crypto seed phrase or private key. If anyone
          does while claiming to represent us, stop and contact support.
        </p>
      </div>
    </AppShell>
  );
}
