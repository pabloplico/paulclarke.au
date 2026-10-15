/**
 * Local development with nothing else running: no Docker, Postgres or Redis.
 *
 *   pnpm nx run admin-portal:dev:lite     (or pnpm dev:lite in apps/admin-portal)
 *
 * It's also what `admin-portal:dev` and root `pnpm dev` run, so a fresh clone
 * needs only `pnpm install && pnpm dev`. Next.js listens on 127.0.0.1:3001.
 *
 * - The database is PGlite, kept in apps/admin-portal/.pglite between runs
 *   (delete the folder to start again). Uploads go in .pglite/uploads.
 * - Jobs run in-process (QUEUE_DRIVER=memory).
 * - Sign-in is off (AUTH_ENABLED=false): you're the first user, which this
 *   script creates on an empty database, with the onboarding workspace.
 * - Anything already set in the environment wins, so you can still pass
 *   OPENAI_API_KEY, AI_MODEL and so on for AI features.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const defaults: Record<string, string> = {
  DB_DRIVER: 'pglite',
  PGLITE_DATA_DIR: join(process.cwd(), '.pglite', 'data'),
  UPLOADS_DIR: join(process.cwd(), '.pglite', 'uploads'),
  QUEUE_DRIVER: 'memory',
  AUTH_ENABLED: 'false',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;

async function seed() {
  const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
  await ensurePgliteReady();
  const { db } = await import('@/lib/db');
  const { adminUsers } = await import('@/lib/db/schema');
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (existing) {
    console.log('[dev:lite] Database ready (existing data kept)');
  } else {
    const { hashPassword } = await import('@/lib/auth');
    const { seedDefaultWorkspace } = await import('@/lib/onboarding/seed-default-workspace');
    const { randomBytes } = await import('node:crypto');
    const [user] = await db
      .insert(adminUsers)
      .values({
        email: 'dev@localhost.test',
        name: 'Dev',
        role: 'admin',
        // Sign-in is off in dev:lite; the password is never used
        passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
      })
      .returning({ id: adminUsers.id });
    if (!user) throw new Error('Could not create the dev user');
    await seedDefaultWorkspace(user.id);
    console.log(
      '[dev:lite] New database: created dev@localhost.test with the Getting Started workspace'
    );
  }
  // Release the data directory: only one process may open it, and next dev is next
  await getPglite().close();
}

async function main() {
  await seed();
  // This machine only, unless DEV_HOST opts in (0.0.0.0 for other devices on the network)
  const host = process.env.DEV_HOST || '127.0.0.1';
  const next = spawn('next', ['dev', '--port', '3001', '--hostname', host], {
    stdio: 'inherit',
    env: process.env,
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => next.kill(signal));
  }
  next.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error('[dev:lite] failed:', error);
  process.exit(1);
});
