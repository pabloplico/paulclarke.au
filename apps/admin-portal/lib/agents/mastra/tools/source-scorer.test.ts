import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { eq } = await import('drizzle-orm');
const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminResearchSources, adminUsers, adminWorkspaces } = await import('@/lib/db/schema');
const { sourceScorerTool } = await import('./source-scorer');

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

let seq = 0;

async function givenSource(authorityScore: number | null) {
  seq++;
  const [user] = await db
    .insert(adminUsers)
    .values({ email: `scorer-${seq}@example.com`, passwordHash: 'x', name: 'Scorer' })
    .returning();
  const [workspace] = await db
    .insert(adminWorkspaces)
    .values({ slug: `scorer-${seq}`, title: 'Scorer', userId: user!.id })
    .returning();
  const [source] = await db
    .insert(adminResearchSources)
    .values({
      userId: user!.id,
      workspaceId: workspace!.id,
      name: 'Cairns Post',
      sourceType: 'web_scrape',
      url: 'https://example.com',
      authorityScore,
    })
    .returning();
  return source!;
}

const score = (input: Record<string, unknown>) =>
  sourceScorerTool.execute?.(input as never, {} as never);

const stored = async (id: number) =>
  (await db.select().from(adminResearchSources).where(eq(adminResearchSources.id, id)))[0];

describe('source-scorer tool', () => {
  it('stores the new scores and returns the composite the database computes', async () => {
    const source = await givenSource(0.6);
    const before = Date.now();

    const result = await score({ sourceId: source.id, qualityScore: 0.9, reliabilityScore: 0.7 });

    // 0.9 × 0.4 + 0.7 × 0.35 + 0.6 × 0.25
    expect(result).toEqual({ sourceId: source.id, compositeScore: expect.closeTo(0.755, 5) });
    const row = await stored(source.id);
    expect(row).toMatchObject({
      qualityScore: expect.closeTo(0.9, 5),
      reliabilityScore: expect.closeTo(0.7, 5),
      compositeScore: expect.closeTo((result as { compositeScore: number }).compositeScore, 5),
    });
    expect(row?.lastCrawledAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('counts a missing authority score as 0.5', async () => {
    const source = await givenSource(null);

    const result = await score({ sourceId: source.id, qualityScore: 1, reliabilityScore: 1 });

    expect(result).toEqual({ sourceId: source.id, compositeScore: expect.closeTo(0.875, 5) });
  });

  it('fails for a source that does not exist', async () => {
    await expect(
      score({ sourceId: 999_999, qualityScore: 0.5, reliabilityScore: 0.5 })
    ).rejects.toThrow('Source 999999 not found');
  });

  it('refuses scores outside 0 to 1 without writing anything', async () => {
    const source = await givenSource(0.5);

    const result = await score({ sourceId: source.id, qualityScore: 1.5, reliabilityScore: 0.5 });

    expect(result).toMatchObject({ error: true });
    expect((await stored(source.id))?.qualityScore).toBe(0.5);
  });
});
