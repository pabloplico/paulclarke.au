import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Real PGlite database; only the enqueue functions are mocked
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const queueDocument = vi.hoisted(() => vi.fn((_id: number) => Promise.resolve()));
const queueRouting = vi.hoisted(() => vi.fn((_id: number) => Promise.resolve()));
vi.mock('@/lib/document-processing/queue', () => ({ queueDocument }));
vi.mock('@/lib/workspace-routing/queue', () => ({ queueRouting }));

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminDocuments, adminInboxItems, adminUsers } = await import('@/lib/db/schema');
const { recoverInterruptedJobs } = await import('./recover');

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

describe('recoverInterruptedJobs', () => {
  it('re-queues unfinished documents and inbox items that lost their routing job', async () => {
    const [user] = await db
      .insert(adminUsers)
      .values({ email: 'recover@example.com', passwordHash: 'x', name: 'Recover' })
      .returning();
    const userId = user?.id;

    const statuses = ['uploaded', 'embedding', 'analyzing', 'ready', 'error', 'ready'];
    const docs = await db
      .insert(adminDocuments)
      .values(
        statuses.map((status, i) => ({
          userId,
          status,
          title: `doc ${i}`,
          filename: `doc-${i}.md`,
          mimeType: 'text/markdown',
          filePath: `doc-${i}.md`,
          fileSize: 1,
        }))
      )
      .returning({ id: adminDocuments.id, status: adminDocuments.status });
    const docId = (i: number) => docs[i]?.id;

    const items = await db
      .insert(adminInboxItems)
      .values([
        // Mid-routing when the process stopped
        { userId, type: 'file', title: 'routing', status: 'processing', documentId: docId(3) },
        // Document finished, routing job lost
        { userId, type: 'file', title: 'lost', status: 'pending', documentId: docId(5) },
        // Document still processing: its document job queues routing later
        { userId, type: 'file', title: 'waiting', status: 'pending', documentId: docId(0) },
        // Finished or failed: left alone
        { userId, type: 'file', title: 'done', status: 'routed', documentId: docId(3) },
        { userId, type: 'file', title: 'failed', status: 'failed', documentId: docId(4) },
      ])
      .returning({ id: adminInboxItems.id, title: adminInboxItems.title });
    const itemId = (title: string) => items.find((i) => i.title === title)?.id;

    const result = await recoverInterruptedJobs();

    expect(result).toEqual({ documents: 3, inboxItems: 2 });
    expect(queueDocument.mock.calls.map(([id]) => id).sort()).toEqual(
      [docId(0), docId(1), docId(2)].sort()
    );
    expect(queueRouting.mock.calls.map(([id]) => id).sort()).toEqual(
      [itemId('routing'), itemId('lost')].sort()
    );
  });
});
