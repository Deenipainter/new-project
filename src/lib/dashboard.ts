import "server-only";

import { prisma } from "@/lib/db";
import { loadServiceStates } from "@/lib/services";
import { listTransactions, type TxView } from "@/lib/transactions";
import { isAlrahuzReady, isPaystackReady } from "@/lib/config";
import type { ServiceState } from "@/lib/catalog";

export type DashboardData = {
  ok: boolean;
  transactions: TxView[];
  services: ServiceState[];
  announcements: Array<{ id: string; title: string; body: string }>;
  referral: { code: string; total: number; qualified: number };
  pendingOrders: number;
  providers: { alrahuz: boolean; paystack: boolean };
};

export async function loadDashboard(userId: string, referralCode: string): Promise<DashboardData> {
  try {
    const [transactions, services, announcements, referral] = await Promise.all([
      listTransactions(userId, { limit: 5 }),
      loadServiceStates(),
      prisma.announcement.findMany({
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { id: true, title: true, body: true },
      }),
      prisma.referral.findMany({
        where: { referrerId: userId },
        select: { qualifiedAt: true },
      }),
    ]);

    const pendingOrders = await prisma.vtuOrder.count({ where: { userId, status: "PENDING" } });

    return {
      ok: true,
      transactions,
      services,
      announcements,
      referral: {
        code: referralCode,
        total: referral.length,
        qualified: referral.filter((row) => row.qualifiedAt).length,
      },
      pendingOrders,
      providers: { alrahuz: isAlrahuzReady(), paystack: isPaystackReady() },
    };
  } catch (error) {
    console.error("[dashboard] load failed", error instanceof Error ? error.message : error);
    return {
      ok: false,
      transactions: [],
      services: [],
      announcements: [],
      referral: { code: referralCode, total: 0, qualified: 0 },
      pendingOrders: 0,
      providers: { alrahuz: isAlrahuzReady(), paystack: isPaystackReady() },
    };
  }
}
