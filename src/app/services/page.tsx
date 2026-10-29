import React from 'react';

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { loadServiceStates } from "@/lib/services";

export const metadata = { title: "All services" };
export const dynamic = "force-dynamic";

const GROUPS = [
  { id: "core", title: "Everyday top-ups" },
  { id: "growth", title: "Resell & grow" },
  { id: "identity", title: "Identity & verification" },
] as const;

export default async function ServicesPage() {
  const user = await requireUser();
  const services = await loadServiceStates();

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
      <div className="mx-auto max-w-[720px] space-y-5">
        <div>
          <h1 className="text-[20px] font-bold sm:text-[24px]">All services</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Availability is shown honestly. Anything not ready explains exactly what is missing.
          </p>
        </div>

        {GROUPS.map((group) => {
          const items = services.filter((service) => service.group === group.id);
          if (items.length === 0) return null;
          return (
            <section key={group.id} className="space-y-2">
              <h2 className="section-label">{group.title}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((service) => (
                  <Link
                    key={service.key}
                    href={service.href}
                    className="panel flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:border-brand/30"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{service.name}</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                        {service.description}
                      </p>
                      <span
                        className={
                          service.status === "ENABLED"
                            ? "mt-1.5 inline-block rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2 py-0.5 text-[10px] font-semibold text-[#0B7A45]"
                            : service.status === "PROVIDER_CONFIG_REQUIRED"
                              ? "mt-1.5 inline-block rounded-full border border-[#F3E2C0] bg-[#FBF4E6] px-2 py-0.5 text-[10px] font-semibold text-[#8A5B12]"
                              : "mt-1.5 inline-block rounded-full border border-line bg-secondary px-2 py-0.5 text-[10px] font-semibold text-ink-muted"
                        }
                      >
                        {service.status === "ENABLED"
                          ? "Available"
                          : service.status === "PROVIDER_CONFIG_REQUIRED"
                            ? "Provider pending"
                            : "Coming soon"}
                      </span>
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-ink-muted" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
