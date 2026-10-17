import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../index';

const appRoot = path.resolve(import.meta.dirname, '../..');

export interface TestPlatform {
  env: Env;
  dispose: () => Promise<void>;
}

/**
 * The Worker's bindings from wrangler's local runtime, with a D1 database of its
 * own: in memory (`persist: false`), so tests never touch the dev database and
 * each call starts empty. Call `dispose()` when done.
 */
export async function createTestPlatform({ migrate = true } = {}): Promise<TestPlatform> {
  const platform = await getPlatformProxy<Env>({
    configPath: path.join(appRoot, 'wrangler.jsonc'),
    persist: false,
  });
  if (migrate) await applyMigrations(platform.env.DB);
  // Bindings from the proxy, vars set here: getPlatformProxy also loads a developer's
  // .dev.vars (envFiles doesn't stop it), which would make tests differ from CI
  const env: Env = { DB: platform.env.DB, ENVIRONMENT: 'production' };
  return { env, dispose: platform.dispose };
}

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
