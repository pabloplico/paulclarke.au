import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The inbox showcase flow end to end, through the real API route handlers,
 * workers and database: upload -> parse -> chunk -> embed -> analyse ->
 * route, then search.
 *
 * Default: PGlite + in-process queues, no services, so it runs in CI.
 * FLOW_DRIVERS=postgres runs the same flow on the dev setup instead,
 * Postgres + BullMQ, against TEST_DATABASE_URL (an empty, throwaway
 * database) and TEST_REDIS_URL.
 *
 * Only two things are faked: the AI models (test/fake-ai.ts, deterministic
 * and offline) and the signed-in user (cookies don't exist here).
 */
const onDevDrivers = process.env.FLOW_DRIVERS === 'postgres';
if (onDevDrivers) {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL) {
    throw new Error('FLOW_DRIVERS=postgres needs TEST_DATABASE_URL and TEST_REDIS_URL');
  }
  process.env.DB_DRIVER = 'postgres';
  process.env.QUEUE_DRIVER = 'bullmq';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL;
} else {
  process.env.DB_DRIVER = 'pglite';
  process.env.QUEUE_DRIVER = 'memory';
  delete process.env.PGLITE_DATA_DIR;
  delete process.env.PGLITE_SNAPSHOT;
}
process.env.NEXT_RUNTIME = 'nodejs';
const uploadsDir = mkdtempSync(join(tmpdir(), 'admin-flow-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

const ids = vi.hoisted(() => ({ userId: 0, workspaceId: 0, sectionId: 0 }));

vi.mock('@/lib/ai/models', async () => {
  const { createFakeChatModel, createFakeEmbeddingModel } = await import('./fake-ai');
  const chat = createFakeChatModel({
    suggestions: () => [
      {
        workspaceId: ids.workspaceId,
        sectionId: ids.sectionId,
        confidence: 0.9,
        action: 'append',
        suggestedContent: 'Keep the cold room between 1 and 5 °C.',
        reasoning: 'Food safety procedure',
        chunkRefs: [0],
      },
    ],
  });
  const embedding = createFakeEmbeddingModel();
  return { getModel: () => chat, getEmbeddingModel: () => embedding };
});

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: async () => ({
    id: ids.userId,
    email: 'flow@example.com',
    name: 'Flow',
    role: 'member',
  }),
}));

const { db } = await import('@/lib/db');
const schema = await import('@/lib/db/schema');
const { eq } = await import('drizzle-orm');

/** Waits until both queues are idle twice running (a document job queues routing). */
async function settle() {
  const { documentQueue } = await import('@/lib/document-processing/queue');
  const { routingQueue } = await import('@/lib/workspace-routing/queue');
  for (let i = 0; i < 2; i++) {
    await documentQueue.drained();
    await routingQueue.drained();
  }
}

beforeAll(async () => {
  if (onDevDrivers) {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db, { migrationsFolder: './drizzle' });
  }
  const { register } = await import('@/instrumentation');
  await register();

  const [user] = await db
    .insert(schema.adminUsers)
    .values({ email: `flow-${Date.now()}@example.com`, passwordHash: 'x', name: 'Flow' })
    .returning();
  const [workspace] = await db
    .insert(schema.adminWorkspaces)
    .values({ slug: `operations-${Date.now()}`, title: 'Operations', userId: user?.id })
    .returning();
  const [section] = await db
    .insert(schema.adminWorkspaceSections)
    .values({ workspaceId: workspace?.id ?? 0, slug: 'food-safety', title: 'Food safety' })
    .returning();
  ids.userId = user?.id ?? 0;
  ids.workspaceId = workspace?.id ?? 0;
  ids.sectionId = section?.id ?? 0;
}, 60_000);

afterAll(async () => {
  rmSync(uploadsDir, { recursive: true, force: true });
  if (onDevDrivers) {
    const { closeRedis } = await import('@/lib/redis');
    await closeRedis();
  } else {
    const { getPglite } = await import('@/lib/db/pglite');
    await getPglite().close();
  }
});

describe(`inbox flow (${onDevDrivers ? 'Postgres + BullMQ' : 'PGlite + in-process queues'})`, () => {
  let documentId = 0;
  let inboxItemId = 0;

  it('accepts an upload and queues it', async () => {
    const { POST } = await import('@/app/api/inbox/route');
    const file = new File(
      [readFileSync(join(__dirname, 'fixtures/harbourside-bakery-handbook.md'))],
      'harbourside-bakery-handbook.md',
      { type: 'text/markdown' }
    );
    const form = new FormData();
    form.set('file', file);

    const response = await POST(
      new Request('http://test/api/inbox', { method: 'POST', body: form })
    );

    expect(response.status).toBe(202);
    const item = await response.json();
    expect(item.status).toBe('pending');
    inboxItemId = item.id;
    documentId = item.documentId;
  });

  it('processes the document: parsed, chunked, embedded and analysed', async () => {
    await settle();

    const [doc] = await db
      .select()
      .from(schema.adminDocuments)
      .where(eq(schema.adminDocuments.id, documentId));
    expect(doc?.processingError).toBeNull();
    expect(doc?.status).toBe('ready');
    expect(doc?.cleanedText).toContain('cold room must stay between 1 and 5');

    const chunks = await db
      .select()
      .from(schema.adminDocumentChunks)
      .where(eq(schema.adminDocumentChunks.documentId, documentId));
    // More than one chunk, so the search below has to pick the right one
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.embedding?.length === 1536)).toBe(true);
  }, 60_000);

  it('routes the inbox item into the workspace section', async () => {
    const [item] = await db
      .select()
      .from(schema.adminInboxItems)
      .where(eq(schema.adminInboxItems.id, inboxItemId));
    expect(item?.processingError).toBeNull();
    expect(item?.status).toBe('routed');
    expect(item?.routingResults).toEqual([
      expect.objectContaining({
        workspaceId: ids.workspaceId,
        sectionId: ids.sectionId,
        workspaceTitle: 'Operations',
        sectionTitle: 'Food safety',
      }),
    ]);
  });

  it('finds the right passage by meaning', async () => {
    const { POST } = await import('@/app/api/find-source/route');
    const response = await POST(
      new Request('http://test/api/find-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'What temperature should the cold room be?' }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hasResults).toBe(true);
    const [best] = body.sources;
    expect(best.documentId).toBe(documentId);
    expect(best.chunks[0].content).toContain('cold room');
  });
});
