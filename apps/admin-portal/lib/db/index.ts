import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { dbDriver } from '@/lib/drivers';
import { createPgliteDb } from './pglite';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  _pgClient: ReturnType<typeof postgres> | undefined;
  _db: Db | undefined;
};

function createDb(): Db {
  if (dbDriver() === 'pglite') {
    // drizzle-orm/pglite has the same query API (PgDatabase); the cast only
    // hides driver-specific result types. Raw db.execute() results differ
    // ({ rows } on PGlite, an array on postgres-js), so app code avoids it.
    return createPgliteDb() as unknown as Db;
  }
  globalForDb._pgClient ??= postgres(process.env.DATABASE_URL!, { max: 5 });
  return drizzle(globalForDb._pgClient, { schema });
}

function getDb(): Db {
  globalForDb._db ??= createDb();
  return globalForDb._db;
}

/**
 * The Drizzle client for whichever driver DB_DRIVER selects. Created on first
 * use rather than at import, so `next build` (which imports every route) never
 * boots PGlite or reads DATABASE_URL.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
