import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Real PGlite database: the race is between two inserts, so it needs a real
// unique constraint, not a mock
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
const uploadsDir = mkdtempSync(join(tmpdir(), 'access-user-test-'));
process.env.UPLOADS_DIR = uploadsDir;

// The real demo seed, with a switch to make it fail
const seedFails = vi.hoisted(() => ({ current: false }));
vi.mock('@/lib/demo-seed/seed', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/demo-seed/seed')>();
  return {
    seedDemoUser: async (...args: Parameters<typeof real.seedDemoUser>) => {
      if (seedFails.current) throw new Error('seed failed');
      return real.seedDemoUser(...args);
    },
  };
});

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock('next/headers', () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({ get: () => undefined }),
}));

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminUsers, adminWorkspaces } = await import('@/lib/db/schema');
const { findOrCreateAccessUser, getCurrentUser } = await import('./server');
const { eq } = await import('drizzle-orm');

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
  rmSync(uploadsDir, { recursive: true, force: true });
  delete process.env.DEMO_MODE;
  delete process.env.DEV_ACCESS_IDENTITY;
});

describe('Access users', () => {
  it('creates one member for simultaneous first visits', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => findOrCreateAccessUser('first@example.com'))
    );
    const ids = new Set(results.map((user) => user?.id));
    expect(ids.size).toBe(1);
    expect(results[0]?.role).toBe('member');

    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, 'first@example.com'));
    expect(rows).toHaveLength(1);

    // Seeded once: Getting Started plus the three bakery workspaces, not five copies
    const workspaces = await db
      .select()
      .from(adminWorkspaces)
      .where(eq(adminWorkspaces.userId, rows[0]!.id));
    expect(workspaces).toHaveLength(4);
  }, 30_000);

  it('creates no account when seeding fails, so the next visit tries again', async () => {
    seedFails.current = true;
    await expect(findOrCreateAccessUser('unlucky@example.com')).rejects.toThrow('seed failed');
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, 'unlucky@example.com'));
    expect(rows).toHaveLength(0);

    seedFails.current = false;
    const user = await findOrCreateAccessUser('unlucky@example.com');
    const workspaces = await db
      .select()
      .from(adminWorkspaces)
      .where(eq(adminWorkspaces.userId, user!.id));
    expect(workspaces).toHaveLength(4);
  }, 30_000);

  it('never reports an admin in demo mode, even for an admin row', async () => {
    await db
      .insert(adminUsers)
      .values({ email: 'boss@example.com', passwordHash: 'x', name: 'Boss', role: 'admin' });
    process.env.DEMO_MODE = 'true';
    process.env.DEV_ACCESS_IDENTITY = 'boss@example.com';

    const user = await getCurrentUser();
    expect(user?.email).toBe('boss@example.com');
    expect(user?.role).toBe('member');
  });
});
