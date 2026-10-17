import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../index';

const appRoot = path.resolve(import.meta.dirname, '../..');

/**
 * The Worker's bindings from wrangler's local runtime, with a D1 database of its
 * own: in memory (`persist: false`), so tests never touch the dev database and
 * each call starts empty. Call `dispose()` when done.
 */
export async function createTestPlatform({ migrate = true } = {}) {
  const platform = await getPlatformProxy<Env>({
    configPath: path.join(appRoot, 'wrangler.jsonc'),
    persist: false,
    envFiles: [],
  });
  if (migrate) await applyMigrations(platform.env.DB);
  return platform;
}

export type TestPlatform = Awaited<ReturnType<typeof createTestPlatform>>;

/** Runs drizzle/*.sql in order, as `wrangler d1 migrations apply` does. */
async function applyMigrations(db: D1Database) {
  const dir = path.join(appRoot, 'drizzle');
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const statements = readFileSync(path.join(dir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
}
