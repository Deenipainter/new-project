import React from 'react';

import { AppShell } from "@/components/layout/app-shell";
import { DataPurchase } from "@/components/data/data-purchase";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAlrahuzReady } from "@/lib/config";
import { serviceStatus } from "@/lib/services";
import { formatNaira } from "@/lib/money";

export const metadata = { title: "Buy data" };
export const dynamic = "force-dynamic";

export default async function DataPage() {
  const user = await requireUser();

  const [plans, status] = await Promise.all([
    prisma.dataPlan
      .findMany({
        where: { active: true },
        orderBy: [{ network: "asc" }, { sortOrder: "asc" }],
      })
      .catch((error) => {
        console.error("[data] plan read failed", error instanceof Error ? error.message : error);
        return [];
      }),
    serviceStatus("data"),
  ]);

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
      <DataPurchase
        balanceKobo={user.balanceKobo}
        balanceLabel={formatNaira(user.balanceKobo, { withDecimals: true })}
        providerReady={isAlrahuzReady()}
        serviceStatus={status}
        plans={plans.map((plan) => ({
          planCode: plan.planCode,
          network: plan.network,
          dataType: plan.dataType,
          name: plan.name,
          validity: plan.validity,
          priceKobo: plan.priceKobo,
          sizeMb: plan.sizeMb,
          source: plan.source,
        }))}
      />
    </AppShell>
  );
}
