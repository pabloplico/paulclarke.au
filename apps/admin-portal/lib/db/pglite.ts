import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

const g = globalThis as unknown as { _pglite?: PGlite; _pgliteReady?: Promise<void> };

/**
 * The process-wide PGlite instance (DB_DRIVER=pglite).
 *
 * - PGLITE_DATA_DIR: where the database lives on disk. Unset means in memory,
 *   lost on restart. Only one process may open a data directory at a time, so
 *   don't run scripts against it while the server is running.
 * - PGLITE_SNAPSHOT: a dumpDataDir() tarball to start from when the database
 *   is new (the demo's baked-in schema + seed). Ignored when PGLITE_DATA_DIR
 *   already holds a database.
 *
 * On globalThis because Next.js can evaluate this module more than once per
 * process (instrumentation and route bundles), and two instances would be two
 * separate databases.
 */
export function getPglite(): PGlite {
  if (!g._pglite) {
    const dataDir = process.env.PGLITE_DATA_DIR || undefined;
    const snapshot = process.env.PGLITE_SNAPSHOT;
    const isNew = !dataDir || !existsSync(join(dataDir, 'PG_VERSION'));
    // PGlite creates the data directory itself, but not missing parents
    if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
    // Options go in the first argument: new PGlite(undefined, opts) silently ignores them
    g._pglite = new PGlite({
      dataDir,
      loadDataDir: snapshot && isNew ? new Blob([readFileSync(snapshot)]) : undefined,
      extensions: { vector },
    });
  }
  return g._pglite;
}

export function createPgliteDb() {
  return drizzle(getPglite(), { schema });
}

/**
 * Brings the database up to date with drizzle/ (a no-op when a snapshot or
 * data directory already has every migration). Runs once per process; await
 * it before the first query.
 *
 * Migrations are read from PGLITE_MIGRATIONS_DIR, or ./drizzle relative to the
 * working directory: apps/admin-portal in dev, and the standalone server's own
 * directory in production (next.config.ts traces drizzle/ into it).
 */
export function ensurePgliteReady(): Promise<void> {
  g._pgliteReady ??= (async () => {
    const pg = getPglite();
    await pg.waitReady;
    const migrationsFolder = process.env.PGLITE_MIGRATIONS_DIR || join(process.cwd(), 'drizzle');
    await migrate(drizzle(pg), { migrationsFolder });
  })();
  return g._pgliteReady;
}
