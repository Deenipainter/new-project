"use client";
import React from 'react';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  House,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  User,
  Wallet as WalletIcon,
} from "lucide-react";

import { BrandLockup, LogoMark } from "@/components/brand";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ShellUser = {
  id: string;
  fullName: string;
  email: string;
  role: "USER" | "ADMIN";
  balanceKobo: number;
};

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/profile", label: "Profile", icon: User },
];

const SIDE_NAV = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/data", label: "Buy data", icon: LayoutGrid },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/referrals", label: "Referrals", icon: ShieldCheck },
  { href: "/profile", label: "Profile", icon: User },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initials = user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-dvh bg-page">
      <div className="mx-auto flex w-full max-w-[1180px] md:gap-8 md:px-6 lg:px-8">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line/70 py-6 pr-5 md:flex">
          <BrandLockup />
          <nav className="mt-7 flex flex-col gap-1" aria-label="Main">
            {SIDE_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                    active ? "bg-brand-tint text-brand" : "text-ink-muted hover:bg-secondary hover:text-ink",
                  )}
                >
                  <item.icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.9} />
                  {item.label}
                </Link>
              );
            })}
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                  isActive(pathname, "/admin")
                    ? "bg-brand-tint text-brand"
                    : "text-ink-muted hover:bg-secondary hover:text-ink",
                )}
              >
                <ShieldCheck className="size-[18px]" strokeWidth={1.9} />
                Admin
              </Link>
            )}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-2xl border border-line bg-white p-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Wallet balance
              </p>
              <p className="numeric mt-1 text-[19px] font-bold text-ink">
                {formatNaira(user.balanceKobo, { withDecimals: true })}
              </p>
              <Link
                href="/wallet/fund"
                className="mt-2 inline-flex text-[12.5px] font-semibold text-brand hover:underline"
              >
                Add money
              </Link>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-secondary hover:text-ink disabled:opacity-60"
            >
              <LogOut className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-page/90 px-4 backdrop-blur md:hidden">
            <Link href="/" aria-label="DP Data Sub home">
              <LogoMark />
            </Link>
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink"
            >
              <WalletIcon className="size-3.5 text-brand" />
              <span className="numeric">{formatNaira(user.balanceKobo, { withDecimals: true })}</span>
            </Link>
            <Link
              href="/profile"
              className="grid size-9 place-items-center rounded-full bg-brand-tint text-[12px] font-bold text-brand"
              aria-label="Your profile"
            >
              {initials || "DP"}
            </Link>
          </header>

          <main className="mx-auto w-full max-w-[900px] px-4 pb-28 pt-4 md:px-0 md:pb-12 md:pt-7">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-brand" : "text-ink-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full transition-colors",
                      active && "bg-brand-tint",
                    )}
                  >
                    <item.icon className="size-[18px]" strokeWidth={active ? 2.3 : 1.8} />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
