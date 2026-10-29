import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * The cached instance is keyed by DATABASE_URL so that changing the connection
 * string (for example pointing a preview at a different database) takes effect
 * on the next hot reload instead of silently keeping the old datasource.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

const databaseUrl = process.env.DATABASE_URL ?? "";

// Safety net: a loopback database is only ever the disposable verification
// instance used when the managed PostgreSQL service is unavailable. Refuse to
// boot a production deployment against it instead of failing silently later.
if (
  process.env.NODE_ENV === "production" &&
  /(^|@)(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(databaseUrl)
) {
  throw new Error(
    "DATABASE_URL points at a loopback address. Production must use the managed PostgreSQL connection string.",
  );
}

const cachedIsValid =
  globalForPrisma.prisma !== undefined && globalForPrisma.prismaUrl === databaseUrl;

export const prisma = cachedIsValid
  ? globalForPrisma.prisma!
  : new PrismaClient({ log: ["warn", "error"] });

globalForPrisma.prisma = prisma;
globalForPrisma.prismaUrl = databaseUrl;

export const DB_UNAVAILABLE_MESSAGE =
  "The DP Data Sub database is not reachable right now. Please try again.";
