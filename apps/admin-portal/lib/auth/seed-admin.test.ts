import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminUsers } = await import('@/lib/db/schema');
const { verifyPassword } = await import('./index');
const { seedAdminUser } = await import('./seed-admin');

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

describe('seedAdminUser', () => {
  it('requires an email: there is no default account', async () => {
    await expect(seedAdminUser({ email: undefined })).rejects.toThrow('ADMIN_EMAIL is required');
    await expect(seedAdminUser({ email: 'not-an-email' })).rejects.toThrow('ADMIN_EMAIL');
  });

  // Three real bcrypt operations at the production cost (12): about 1.5 s idle,
  // past the 5 s default when the CPU is busy with builds
  it('generates a random password when none is given, and never uses admin123', async () => {
    const result = await seedAdminUser({ email: 'Owner@Example.com' });
    expect(result.created).toBe(true);
    expect(result.generatedPassword).toMatch(/^[\w-]{24}$/);

    const [row] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, 'owner@example.com'));
    expect(row?.role).toBe('admin');
    expect(await verifyPassword(row?.passwordHash ?? '', result.generatedPassword ?? '')).toBe(
      true
    );
    expect(await verifyPassword(row?.passwordHash ?? '', 'admin123')).toBe(false);
  }, 20_000);

  it('rejects a weak password', async () => {
    await expect(seedAdminUser({ email: 'b@example.com', password: 'short' })).rejects.toThrow(
      'too weak'
    );
  });

  it('leaves an existing account alone', async () => {
    const again = await seedAdminUser({ email: 'owner@example.com', password: 'Another-pass-1' });
    expect(again).toEqual({ email: 'owner@example.com', created: false });
  });

  it('creates new rows as members unless they are seeded admins', async () => {
    const [row] = await db
      .insert(adminUsers)
      .values({ email: 'plain@example.com', passwordHash: 'x', name: 'Plain' })
      .returning();
    expect(row?.role).toBe('member');
  });
});
