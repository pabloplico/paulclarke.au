import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../env';
import { DEV_IDENTITY_COOKIE } from '../identity';
import app from '../index';

const appRoot = path.resolve(import.meta.dirname, '../..');

type Vars = Omit<Env, 'DB'>;

export interface TestPlatform {
  env: Env;
  dispose: () => Promise<void>;
}

/**
 * The Worker's bindings from wrangler's local runtime, with a D1 database of its
 * own: in memory (`persist: false`), so tests never touch the dev database and
 * each call starts empty. Vars default to production's. Call `dispose()` when done.
 */
export async function createTestPlatform({
  migrate = true,
  vars = { ENVIRONMENT: 'production' } as Vars,
} = {}): Promise<TestPlatform> {
  const platform = await getPlatformProxy<Env>({
    configPath: path.join(appRoot, 'wrangler.jsonc'),
    persist: false,
  });
  if (migrate) await applyMigrations(platform.env.DB);
  // Bindings from the proxy, vars from the caller: getPlatformProxy also loads a
  // developer's .dev.vars (envFiles doesn't stop it), which would make tests differ from CI
  const env: Env = { DB: platform.env.DB, ...vars };
  return { env, dispose: platform.dispose };
}

/** Starting wrangler's local runtime takes a few seconds. */
export const STARTUP_MS = 30_000;

/** Unique per call, so tests sharing a database never share a profile. */
export const newIdentity = () => `visitor-${crypto.randomUUID()}@example.com`;

/**
 * Calls the API as `identity` (through the development-only identity cookie),
 * or as nobody. JSON bodies are sent as JSON.
 */
export function apiAs(env: Env, identity?: string) {
  return (method: string, url: string, body?: unknown) =>
    app.request(
      url,
      {
        method,
        headers: {
          ...(identity ? { Cookie: `${DEV_IDENTITY_COOKIE}=${identity}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env
    );
}

/** Calls the API with exactly these headers (no development identity cookie). */
export function apiWithHeaders(env: Env, headers: Record<string, string>) {
  return (method: string, url: string, body?: unknown) =>
    app.request(
      url,
      {
        method,
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env
    );
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
