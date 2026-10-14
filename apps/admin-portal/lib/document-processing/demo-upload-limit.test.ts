import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminDocuments, adminUsers } = await import('@/lib/db/schema');
const { DEMO_UPLOAD_LIMIT, rejectDemoUploadOverLimit } = await import('./demo-upload-limit');
const { SEEDED_DOCUMENT_COUNT } = await import('@/lib/demo-seed/content');

let userId = 0;

async function addDocuments(n: number) {
  await db.insert(adminDocuments).values(
    Array.from({ length: n }, (_, i) => ({
      userId,
      title: `doc ${i}`,
      filename: 'doc.md',
      mimeType: 'text/markdown',
      filePath: '',
      fileSize: 1,
    }))
  );
}

beforeAll(async () => {
  await ensurePgliteReady();
  const [user] = await db
    .insert(adminUsers)
    .values({ email: 'cap@example.com', passwordHash: 'x', name: 'Cap' })
    .returning();
  userId = user!.id;
}, 30_000);

afterEach(() => {
  delete process.env.DEMO_MODE;
});

afterAll(async () => {
  await getPglite().close();
});

describe('demo upload limit', () => {
  it(`allows ${DEMO_UPLOAD_LIMIT} uploads on top of the seeded document, then refuses`, async () => {
    process.env.DEMO_MODE = 'true';
    await addDocuments(SEEDED_DOCUMENT_COUNT + DEMO_UPLOAD_LIMIT - 1);
    expect(await rejectDemoUploadOverLimit(userId)).toBeNull();

    await addDocuments(1);
    const refused = await rejectDemoUploadOverLimit(userId);
    expect(refused?.status).toBe(429);
    const body = (await refused?.json()) as { error?: string } | undefined;
    expect(body?.error).toMatch(/20 uploads per visitor/);
  });

  it('never applies outside demo mode', async () => {
    expect(await rejectDemoUploadOverLimit(userId)).toBeNull();
  });
});
