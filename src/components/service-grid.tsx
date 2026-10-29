import React from 'react';

import Link from "next/link";
import {
  ArrowLeftRight,
  Bitcoin,
  Building2,
  CreditCard,
  Gift,
  Globe,
  GraduationCap,
  IdCard,
  LayoutGrid,
  ShieldCheck,
  Smartphone,
  Ticket,
  Tv,
  Users,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  data: Wifi,
  airtime: Smartphone,
  cable: Tv,
  electricity: Zap,
  card: CreditCard,
  bonus: Gift,
  transfer: ArrowLeftRight,
  pin: Ticket,
  education: GraduationCap,
  globe: Globe,
  referrals: Users,
  more: LayoutGrid,
  cac: Building2,
  nin: IdCard,
  bvn: ShieldCheck,
  crypto: Bitcoin,
};

export type ServiceTile = {
  key: string;
  name: string;
  short: string;
  href: string;
  icon: string;
  status: "ENABLED" | "PROVIDER_CONFIG_REQUIRED" | "COMING_SOON";
};

export function ServiceGrid({ items, columns = 4 }: { items: ServiceTile[]; columns?: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-x-2 gap-y-4",
        columns === 4 ? "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6" : "grid-cols-3",
      )}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutGrid;
        const live = item.status === "ENABLED";
        return (
          <Link
            key={item.key}
            href={item.href}
            className="group flex flex-col items-center gap-2 rounded-2xl px-1 py-1.5 text-center transition-colors hover:bg-white"
          >
            <span className="relative grid size-[46px] place-items-center rounded-[14px] bg-brand-tint text-brand transition-transform duration-200 group-hover:-translate-y-0.5">
              <Icon className="size-[20px]" strokeWidth={1.9} />
              {!live && (
                <span
                  className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white bg-[#B07A2A]"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="text-[11px] font-medium leading-tight text-ink">{item.short}</span>
            <span className="sr-only">
              {item.name}
              {live ? "" : " — not live yet"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
