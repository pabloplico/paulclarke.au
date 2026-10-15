/**
 * Demo mode on your machine: what a visitor sees, with no Cloudflare Access.
 *
 *   OPENAI_API_KEY=… pnpm nx run admin-portal:dev:demo     (or pnpm dev:demo here)
 *
 * Next.js on 127.0.0.1:3003, beside dev:lite or dev:full (3001) and jobquest (3002).
 *
 * - DEMO_MODE=true, signed in as DEV_ACCESS_IDENTITY (default
 *   visitor@example.com), which stands in for the Access identity. Set it to
 *   another email to see a fresh visitor.
 * - A fresh PGlite database in .pglite/demo on every start, like the hosted
 *   demo after a restart. The first request seeds the visitor (lib/demo-seed).
 * - OpenAI with gpt-4.1-nano unless AI_PROVIDER/AI_MODEL are set. The key is
 *   required (demo mode refuses to start without one), and AI features spend
 *   on it, within the demo's caps.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), '.pglite');
const defaults: Record<string, string> = {
  DEMO_MODE: 'true',
  DEV_ACCESS_IDENTITY: 'visitor@example.com',
  DB_DRIVER: 'pglite',
  QUEUE_DRIVER: 'memory',
  AI_PROVIDER: 'openai',
  AI_MODEL: 'gpt-4.1-nano',
  // Its own build folder: next dev locks .next/dev, and the Docker dev server uses that
  NEXT_DIST_DIR: '.next/demo',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
// Always these two, never whatever the shell has: both are deleted on every start
process.env.PGLITE_DATA_DIR = join(dir, 'demo');
process.env.UPLOADS_DIR = join(dir, 'demo-uploads');
// Demo mode refuses to start with sign-in switched off
delete process.env.AUTH_ENABLED;

if (!process.env.OPENAI_API_KEY) {
  console.error('[dev:demo] Set OPENAI_API_KEY: demo mode checks the AI setup at start-up.');
  process.exit(1);
}

for (const path of [process.env.PGLITE_DATA_DIR, process.env.UPLOADS_DIR]) {
  if (path) rmSync(path, { recursive: true, force: true });
}
console.log(`[dev:demo] Fresh demo database; signed in as ${process.env.DEV_ACCESS_IDENTITY}`);

// This machine only, unless DEV_HOST opts in (0.0.0.0 for other devices on the network)
const host = process.env.DEV_HOST || '127.0.0.1';
const next = spawn('next', ['dev', '--port', '3003', '--hostname', host], {
  stdio: 'inherit',
  env: process.env,
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => next.kill(signal));
}
next.on('exit', (code) => process.exit(code ?? 0));
