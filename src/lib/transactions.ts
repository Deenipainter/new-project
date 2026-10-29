import "server-only";

import { prisma } from "@/lib/db";
import { formatDateShort } from "@/lib/format";

export type TxKind = "ORDER" | "FUNDING" | "REFUND" | "ADJUSTMENT" | "REWARD";

export type TxView = {
  id: string;
  source: "order" | "ledger";
  reference: string;
  kind: TxKind;
  title: string;
  subtitle: string;
  amountKobo: number;
  direction: "CREDIT" | "DEBIT";
  status: string;
  createdAt: Date;
  dateLabel: string;
};

const LEDGER_LABEL: Record<string, { title: string; kind: TxKind }> = {
  FUNDING: { title: "Wallet funding", kind: "FUNDING" },
  PURCHASE: { title: "Purchase", kind: "ORDER" },
  REFUND: { title: "Refund", kind: "REFUND" },
  REFERRAL_REWARD: { title: "Referral reward", kind: "REWARD" },
  ADMIN_ADJUSTMENT: { title: "Balance adjustment", kind: "ADJUSTMENT" },
};

/** Only the signed-in user's own records are ever queried. */
export async function listTransactions(
  userId: string,
  options: { limit?: number; query?: string; status?: string } = {},
): Promise<TxView[]> {
  const limit = options.limit ?? 50;

  const [orders, entries] = await Promise.all([
    prisma.vtuOrder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const fromOrders: TxView[] = orders.map((order) => ({
    id: order.id,
    source: "order",
    reference: order.reference,
    kind: "ORDER",
    title: `${order.network ?? ""} ${order.dataType ?? order.serviceType}`.trim(),
    subtitle: `${order.planName ?? order.serviceType} · ${order.recipient}`,
    amountKobo: order.amountKobo,
    direction: "DEBIT",
    status: order.status,
    createdAt: order.createdAt,
    dateLabel: formatDateShort(order.createdAt),
  }));

  const fromLedger: TxView[] = entries.map((entry) => {
    const meta = LEDGER_LABEL[entry.type] ?? { title: "Wallet entry", kind: "ADJUSTMENT" as TxKind };
    return {
      id: entry.id,
      source: "ledger",
      reference: entry.reference,
      kind: meta.kind,
      title: meta.title,
      subtitle: entry.narration,
      amountKobo: entry.amountKobo,
      direction: entry.direction,
      status: entry.type === "REFUND" ? "REFUNDED" : "SUCCESSFUL",
      createdAt: entry.createdAt,
      dateLabel: formatDateShort(entry.createdAt),
    };
  });

  const seen = new Set<string>();
  const merged = [...fromOrders, ...fromLedger]
    .filter((item) => {
      // A purchase debit and its order share one story; the order row wins.
      if (item.source === "ledger" && item.kind === "ORDER" && item.reference.startsWith("DEBIT-")) {
        return false;
      }
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const query = options.query?.trim().toLowerCase();
  const status = options.status && options.status !== "ALL" ? options.status.toUpperCase() : null;

  return merged
    .filter((item) => {
      if (status && item.status !== status) return false;
      if (!query) return true;
      return (
        item.reference.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.subtitle.toLowerCase().includes(query)
      );
    })
    .slice(0, limit);
}

export async function findTransaction(userId: string, id: string) {
  const order = await prisma.vtuOrder.findFirst({ where: { id, userId } });
  if (order) {
    return {
      type: "order" as const,
      order,
      timeline: [
        { label: "Order created", at: order.createdAt },
        { label: "Last provider update", at: order.updatedAt },
      ],
    };
  }

  const entry = await prisma.ledgerEntry.findFirst({ where: { id, userId } });
  if (entry) {
    const relatedOrder = entry.orderId
      ? await prisma.vtuOrder.findFirst({ where: { id: entry.orderId, userId } })
      : null;
    return {
      type: "ledger" as const,
      entry,
      relatedOrder,
      timeline: [{ label: "Ledger entry posted", at: entry.createdAt }],
    };
  }
  return null;
}
