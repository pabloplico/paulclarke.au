import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

const globalForDb = globalThis as unknown as {
  _pgClient: ReturnType<typeof postgres> | undefined;
  _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

if (!globalForDb._pgClient) {
  globalForDb._pgClient = postgres(connectionString, { max: 5 });
}

if (!globalForDb._db) {
  globalForDb._db = drizzle(globalForDb._pgClient, { schema });
}

export const db = globalForDb._db;
