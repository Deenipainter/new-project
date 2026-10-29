// Local verification database for environments where the managed PostgreSQL
// instance is unavailable. Runs a real PostgreSQL (WASM build) over TCP so the
// application and Prisma can connect with a normal postgresql:// URL.
//
//   node scripts/dev-pg.mjs            # listens on 127.0.0.1:55432
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres ...
//
// Data lives in the container filesystem (/tmp/dpds-pgdata) and is disposable.
// This is NOT a production database and never replaces the managed instance.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dataDir = process.env.PGLITE_DATA_DIR || "/tmp/dpds-pgdata";
const port = Number(process.env.PGLITE_PORT || 55432);
const host = process.env.PGLITE_HOST || "127.0.0.1";

const maxConnections = Number(process.env.PGLITE_MAX_CONNECTIONS || 10);

const db = await PGlite.create({ dataDir });
// PGlite is single-connection; the server multiplexes concurrent clients.
const server = new PGLiteSocketServer({ db, port, host, maxConnections });

await server.start();
console.log(`pglite ready on ${host}:${port} (dataDir=${dataDir})`);

const shutdown = async () => {
  try {
    await server.stop();
    await db.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
