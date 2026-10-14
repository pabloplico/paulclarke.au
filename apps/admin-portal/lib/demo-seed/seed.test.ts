import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Real PGlite: the seed's value is in the rows it writes and how they link up
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
const uploadsDir = mkdtempSync(join(tmpdir(), 'demo-seed-test-'));
process.env.UPLOADS_DIR = uploadsDir;

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const schema = await import('@/lib/db/schema');
const { and, eq, inArray } = await import('drizzle-orm');
const { seedDemoUser } = await import('./seed');
const { DEMO_WORKSPACES, GAP_REPORT_WORKSPACES } = await import('./content');
const { computeStaleness, hashSectionContent } = await import('@/lib/gap-analysis/content-hash');
const { getLatestVersions } = await import('@/lib/workspaces/latest-versions');

async function newUser(email: string) {
  const [user] = await db
    .insert(schema.adminUsers)
    .values({ email, passwordHash: 'x', name: 'Visitor' })
    .returning();
  return user!.id;
}

let userId = 0;

beforeAll(async () => {
  await ensurePgliteReady();
  userId = await newUser('visitor@example.com');
  await db.transaction((tx) => seedDemoUser(tx, userId));
}, 60_000);

afterAll(async () => {
  await getPglite().close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

describe('demo seed', () => {
  it('gives the visitor Getting Started plus the bakery workspaces', async () => {
    const workspaces = await db
      .select()
      .from(schema.adminWorkspaces)
      .where(eq(schema.adminWorkspaces.userId, userId))
      .orderBy(schema.adminWorkspaces.sortOrder);
    expect(workspaces.map((w) => w.title)).toEqual([
      'Getting Started',
      ...DEMO_WORKSPACES.map((w) => w.title),
    ]);
  });

  it('keeps version history, newest last', async () => {
    const [section] = await db
      .select()
      .from(schema.adminWorkspaceSections)
      .innerJoin(
        schema.adminWorkspaces,
        eq(schema.adminWorkspaceSections.workspaceId, schema.adminWorkspaces.id)
      )
      .where(
        and(
          eq(schema.adminWorkspaces.userId, userId),
          eq(schema.adminWorkspaceSections.slug, 'opening-closing')
        )
      );
    const versions = await db
      .select()
      .from(schema.adminSectionVersions)
      .where(eq(schema.adminSectionVersions.sectionId, section!.admin_workspace_sections.id))
      .orderBy(schema.adminSectionVersions.version);
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(versions[2]!.createdAt.getTime()).toBeGreaterThan(versions[0]!.createdAt.getTime());
  });

  it('has a processed document with an embedding on every chunk', async () => {
    const [doc] = await db
      .select()
      .from(schema.adminDocuments)
      .where(eq(schema.adminDocuments.userId, userId));
    expect(doc?.status).toBe('ready');
    const chunks = await db
      .select()
      .from(schema.adminDocumentChunks)
      .where(eq(schema.adminDocumentChunks.documentId, doc!.id));
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(chunk.embedding).toHaveLength(1536);
  });

  it('routes the inbox item only to sections inside the named workspace', async () => {
    const [item] = await db
      .select()
      .from(schema.adminInboxItems)
      .where(eq(schema.adminInboxItems.userId, userId));
    expect(item?.status).toBe('routed');
    expect(item?.routingResults?.length).toBeGreaterThan(0);

    const sectionIds = item!.routingResults!.map((r) => r.sectionId);
    const sections = await db
      .select()
      .from(schema.adminWorkspaceSections)
      .where(inArray(schema.adminWorkspaceSections.id, sectionIds));
    for (const r of item!.routingResults!) {
      const section = sections.find((s) => s.id === r.sectionId);
      expect(section?.workspaceId).toBe(r.workspaceId);
      expect(r.sectionTitle).toBe(section?.title);
    }
  });

  it('saves gap reports whose findings start out current', async () => {
    const workspaces = await db
      .select()
      .from(schema.adminWorkspaces)
      .where(eq(schema.adminWorkspaces.userId, userId));
    const reports = await db
      .select()
      .from(schema.adminGapReports)
      .where(
        inArray(
          schema.adminGapReports.workspaceId,
          workspaces.map((w) => w.id)
        )
      );
    expect(reports).toHaveLength(GAP_REPORT_WORKSPACES.length);

    // What the gap analysis GET route does to decide staleness
    for (const report of reports) {
      const ids = Object.keys(report.sectionContentHashes ?? {}).map(Number);
      const latest = await getLatestVersions(ids);
      const current: Record<number, string> = {};
      for (const id of ids) {
        const v = latest.get(id);
        current[id] = hashSectionContent(
          v?.content ?? '',
          (v?.structuredData as Record<string, unknown>) ?? null
        );
      }
      const stale = [...computeStaleness(report.sectionContentHashes!, current).values()];
      expect(stale.every((s) => s === false)).toBe(true);
    }
  });

  it('gives each visitor their own copy', async () => {
    const second = await newUser('second@example.com');
    await db.transaction((tx) => seedDemoUser(tx, second));
    const rows = await db
      .select({ userId: schema.adminWorkspaces.userId })
      .from(schema.adminWorkspaces)
      .where(inArray(schema.adminWorkspaces.userId, [userId, second]));
    expect(rows.filter((r) => r.userId === second)).toHaveLength(DEMO_WORKSPACES.length + 1);
    expect(rows.filter((r) => r.userId === userId)).toHaveLength(DEMO_WORKSPACES.length + 1);
  }, 30_000);
});
