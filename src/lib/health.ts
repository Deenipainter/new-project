import "server-only";

import { prisma } from "@/lib/db";

let cached: { at: number; up: boolean } = { at: 0, up: true };

/**
 * Cheap liveness probe used to explain outages in the UI instead of showing a
 * generic failure. Cached briefly so pages do not hammer the database.
 */
export async function isDatabaseUp(): Promise<boolean> {
  if (Date.now() - cached.at < 5000) return cached.up;
  try {
    await prisma.$queryRaw`SELECT 1`;
    cached = { at: Date.now(), up: true };
    return true;
  } catch {
    cached = { at: Date.now(), up: false };
    return false;
  }
}

export function resetDatabaseHealthCache() {
  cached = { at: 0, up: true };
}
