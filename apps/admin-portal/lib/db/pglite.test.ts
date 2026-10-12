import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The real PGlite driver, in memory, built from drizzle/ by the same code the
// server runs at start-up. Exercises the lazy `db` proxy end to end.
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { db } = await import('./index');
const { ensurePgliteReady, getPglite } = await import('./pglite');
const { adminUsers, adminWorkspaces } = await import('./schema');

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

describe('PGlite driver', () => {
  it('applies the migrations once per process', async () => {
    await ensurePgliteReady();
    const { rows } = await getPglite().query<{ n: number }>(
      'select count(*)::int as n from drizzle.__drizzle_migrations'
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('runs the query builder and the relational query API through the proxy', async () => {
    const [user] = await db
      .insert(adminUsers)
      .values({ email: 'driver@example.com', passwordHash: 'x', name: 'Driver' })
      .returning();
    expect(user?.role).toBe('admin');

    const found = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, 'driver@example.com'),
    });
    expect(found?.id).toBe(user?.id);
  });

  it('commits and rolls back transactions', async () => {
    const [user] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, 'driver@example.com'));
    if (!user) throw new Error('user missing');

    await db.transaction(async (tx) => {
      await tx.insert(adminWorkspaces).values({ slug: 'kept', title: 'Kept', userId: user.id });
    });
    await expect(
      db.transaction(async (tx) => {
        await tx
          .insert(adminWorkspaces)
          .values({ slug: 'dropped', title: 'Dropped', userId: user.id });
        throw new Error('roll back');
      })
    ).rejects.toThrow('roll back');

    const slugs = (await db.select({ slug: adminWorkspaces.slug }).from(adminWorkspaces)).map(
      (w) => w.slug
    );
    expect(slugs).toEqual(['kept']);
  });
});
