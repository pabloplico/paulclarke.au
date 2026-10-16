/**
 * Run a command on the host with the full development settings: the repo's
 * .env.docker, pointed at the services-only compose stack on localhost.
 *
 *   pnpm nx run admin-portal:dev:full           (next dev on 3001)
 *   pnpm with-dev-env pnpm db:migrate           (any command, from apps/admin-portal)
 *
 * - Reads ../../.env.docker. Anything already set in the environment wins.
 * - Fills in what the old app container set for itself: DATABASE_URL from
 *   the POSTGRES_* values, OLLAMA_URL, and OPENAI_API_KEY from
 *   ADMIN_PORTAL_OPENAI_API_KEY.
 * - Only for local commands: lint, check-types, test and build never need it,
 *   and CI has no .env.docker.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const envFile = join(process.cwd(), '../../.env.docker');
if (!existsSync(envFile)) {
  console.error(`[with-dev-env] ${envFile} not found: cp .env.docker.example .env.docker`);
  process.exit(1);
}
process.loadEnvFile(envFile);

const env = process.env;
const user = env.POSTGRES_USER || 'business_portal';
const database = env.POSTGRES_DB || 'business_portal';
const pgPassword = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');

env.DATABASE_URL ??= `postgresql://${user}:${pgPassword}@localhost:5432/${database}`;
env.OLLAMA_URL ??= 'http://localhost:11434';
if (env.ADMIN_PORTAL_OPENAI_API_KEY) env.OPENAI_API_KEY ??= env.ADMIN_PORTAL_OPENAI_API_KEY;

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('[with-dev-env] usage: with-dev-env <command> [args...]');
  process.exit(1);
}

const child = spawn(command, args, { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
