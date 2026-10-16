import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { createHash } = await import('node:crypto');
const { eq } = await import('drizzle-orm');
const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminAgentRuns, adminAgentTasks, adminFindings, adminUsers, adminWorkspaces } =
  await import('@/lib/db/schema');
const { createDbWriterTool } = await import('./db-writer');

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

let seq = 0;

/** A user with a workspace and an agent run of their own. */
async function given() {
  seq++;
  const [user] = await db
    .insert(adminUsers)
    .values({ email: `writer-${seq}@example.com`, passwordHash: 'x', name: 'Writer' })
    .returning();
  const [workspace] = await db
    .insert(adminWorkspaces)
    .values({ slug: `writer-${seq}`, title: 'Writer', userId: user!.id })
    .returning();
  const [task] = await db
    .insert(adminAgentTasks)
    .values({ userId: user!.id, workspaceId: workspace!.id, agentType: 'research', name: 't' })
    .returning();
  const [run] = await db
    .insert(adminAgentRuns)
    .values({ taskId: task!.id, userId: user!.id, status: 'started' })
    .returning();
  return { userId: user!.id, workspaceId: workspace!.id, agentRunId: run!.id };
}

const finding = {
  title: 'Flat white prices',
  content: 'A flat white costs $5.20 on average in Cairns City.',
  findingType: 'pricing',
};

const save = (tool: ReturnType<typeof createDbWriterTool>, input: Record<string, unknown>) =>
  tool.execute?.(input as never, {} as never) as Promise<{ findingId: number; status: string }>;

const findingsIn = (workspaceId: number) =>
  db.select().from(adminFindings).where(eq(adminFindings.workspaceId, workspaceId));

describe('save-finding tool', () => {
  it('saves the finding to its own user, workspace and run, with a content hash', async () => {
    const context = await given();

    const result = await save(createDbWriterTool(context), {
      ...finding,
      confidenceScore: 0.8,
      geo: { country: 'AU', city: 'Cairns' },
      tags: { topics: ['coffee'] },
      url: 'https://example.com/prices',
    });

    expect(result).toEqual({ findingId: expect.any(Number), status: 'saved' });
    const rows = await findingsIn(context.workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.findingId,
      ...context,
      ...finding,
      contentHash: createHash('md5').update(finding.content).digest('hex'),
      confidenceScore: expect.closeTo(0.8, 5),
      geo: { country: 'AU', city: 'Cairns' },
      tags: { topics: ['coffee'] },
      url: 'https://example.com/prices',
    });
  });

  it('ignores a user or workspace the model puts in its input', async () => {
    const context = await given();
    const other = await given();

    await save(createDbWriterTool(context), {
      ...finding,
      userId: other.userId,
      workspaceId: other.workspaceId,
    });

    expect(await findingsIn(other.workspaceId)).toEqual([]);
    expect(await findingsIn(context.workspaceId)).toMatchObject([
      { userId: context.userId, workspaceId: context.workspaceId },
    ]);
  });

  it('defaults the confidence to 0.5', async () => {
    const context = await given();
    await save(createDbWriterTool(context), finding);
    expect((await findingsIn(context.workspaceId))[0]?.confidenceScore).toBe(0.5);
  });

  it('updates the confidence of the same content in the same workspace instead of duplicating it', async () => {
    const context = await given();
    const first = await save(createDbWriterTool(context), { ...finding, confidenceScore: 0.4 });
    const laterRun = await given();

    const second = await save(createDbWriterTool({ ...context, agentRunId: laterRun.agentRunId }), {
      ...finding,
      title: 'A new title',
      confidenceScore: 0.9,
    });

    expect(second.findingId).toBe(first.findingId);
    const rows = await findingsIn(context.workspaceId);
    expect(rows).toHaveLength(1);
    // Only the confidence (and foundAt) change: the title and run stay the first ones
    expect(rows[0]).toMatchObject({
      title: finding.title,
      agentRunId: context.agentRunId,
      confidenceScore: expect.closeTo(0.9, 5),
    });
  });

  it('keeps the same content in another workspace as a separate finding', async () => {
    const a = await given();
    const b = await given();

    const first = await save(createDbWriterTool(a), finding);
    const second = await save(createDbWriterTool(b), finding);

    expect(second.findingId).not.toBe(first.findingId);
    expect(await findingsIn(a.workspaceId)).toHaveLength(1);
    expect(await findingsIn(b.workspaceId)).toHaveLength(1);
  });

  it('refuses invalid input without writing anything', async () => {
    const context = await given();

    const result = await save(createDbWriterTool(context), {
      ...finding,
      findingType: 'gossip',
      url: 'not a url',
    });

    expect(result).toMatchObject({ error: true });
    expect(await findingsIn(context.workspaceId)).toEqual([]);
  });
});
