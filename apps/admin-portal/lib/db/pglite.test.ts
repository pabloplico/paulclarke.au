import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The real PGlite driver, in memory, built from drizzle/ by the same code the
// server runs at start-up. Exercises the lazy `db` proxy end to end.
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
// A host east of UTC, set before PGlite starts: PGlite takes the host's time
// zone unless told otherwise, and the timestamp columns have none
process.env.TZ = 'Australia/Brisbane';

// For the trigger route: the signed-in user, and no real job queue
const signedIn = vi.hoisted(() => ({ user: { id: 0, email: '', name: '', role: 'member' } }));
vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: async () => signedIn.user,
  getCurrentUser: async () => signedIn.user,
}));
vi.mock('@/lib/agents/queue/trigger', () => ({
  triggerResearchTask: async () => 'research-job',
  triggerAnalysisTask: async () => 'analysis-job',
}));

const { db } = await import('./index');
const { ensurePgliteReady, getPglite } = await import('./pglite');
const { adminAgentRuns, adminAgentTasks, adminUsers, adminWorkspaces } = await import('./schema');
const { sql } = await import('drizzle-orm');

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
    const { readMigrationFiles } = await import('drizzle-orm/migrator');
    expect(rows[0]?.n).toBe(readMigrationFiles({ migrationsFolder: './drizzle' }).length);
  });

  it('runs the query builder and the relational query API through the proxy', async () => {
    const [user] = await db
      .insert(adminUsers)
      .values({ email: 'driver@example.com', passwordHash: 'x', name: 'Driver' })
      .returning();
    expect(user?.role).toBe('member');

    const found = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, 'driver@example.com'),
    });
    expect(found?.id).toBe(user?.id);
  });

  it('commits and rolls back transactions', async () => {
    // Its own user, so it doesn't depend on the test above
    const [inserted] = await db
      .insert(adminUsers)
      .values({ email: 'transactions@example.com', passwordHash: 'x', name: 'Transactions' })
      .returning();
    const user = inserted!;

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

    const slugs = (
      await db
        .select({ slug: adminWorkspaces.slug })
        .from(adminWorkspaces)
        .where(eq(adminWorkspaces.userId, user.id))
    ).map((w) => w.slug);
    expect(slugs).toEqual(['kept']);
  });
});

describe('PGlite time zone', () => {
  /** A user, a workspace and a research task of their own. */
  async function givenTask(email: string) {
    const [user] = await db
      .insert(adminUsers)
      .values({ email, passwordHash: 'x', name: 'Time zone' })
      .returning();
    const [workspace] = await db
      .insert(adminWorkspaces)
      .values({ slug: email, title: 'Time zone', userId: user!.id })
      .returning();
    const [task] = await db
      .insert(adminAgentTasks)
      .values({ userId: user!.id, workspaceId: workspace!.id, agentType: 'research', name: 'r' })
      .returning();
    signedIn.user = { id: user!.id, email, name: 'Time zone', role: 'member' };
    return { userId: user!.id, workspaceId: workspace!.id, taskId: task!.id };
  }

  it('runs on a host ten hours east of UTC (so the tests below mean something)', () => {
    expect(new Date('2026-07-01T00:00:00Z').getTimezoneOffset()).toBe(-600);
  });

  it('reads back a run started now as now', async () => {
    const { userId, taskId } = await givenTask('tz-now@example.com');
    // startedAt comes from the column's defaultNow(), so the database's clock
    const [run] = await db
      .insert(adminAgentRuns)
      .values({ taskId, userId, status: 'completed' })
      .returning();
    expect(Math.abs(run!.startedAt.getTime() - Date.now())).toBeLessThan(1000);
  });

  it('lets the trigger route run a task whose last run started two minutes ago', async () => {
    const { userId, taskId, workspaceId } = await givenTask('tz-cooldown@example.com');
    // Two minutes ago by the database's clock: past the 60 s cooldown
    await db.insert(adminAgentRuns).values({
      taskId,
      userId,
      status: 'completed',
      startedAt: sql`now() - interval '2 minutes'`,
    });
    const { POST } = await import(
      '@/app/api/workspaces/[id]/research/agent-tasks/[taskId]/trigger/route'
    );

    const response = await POST(new Request('http://test/trigger', { method: 'POST' }), {
      params: Promise.resolve({ id: String(workspaceId), taskId: String(taskId) }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ taskId, jobId: 'research-job' });
  });
});
