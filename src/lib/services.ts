import "server-only";

import { prisma } from "@/lib/db";
import { SERVICE_CATALOG, getServiceStates, type ServiceState } from "@/lib/catalog";

/**
 * DB-backed service availability with catalogue defaults. A database hiccup
 * must never blank the app, so failures fall back to the catalogue defaults.
 */
export async function loadServiceStates(): Promise<ServiceState[]> {
  try {
    const rows = await prisma.serviceAvailability.findMany({
      select: { key: true, status: true },
    });
    return await getServiceStates(rows);
  } catch (error) {
    console.error("[services] availability read failed", error instanceof Error ? error.message : error);
    return SERVICE_CATALOG.map((entry) => ({ ...entry, status: entry.defaultStatus }));
  }
}

export async function serviceStatus(key: string) {
  const states = await loadServiceStates();
  return states.find((state) => state.key === key)?.status ?? "COMING_SOON";
}
