import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

// Capture the processor worker.ts registers at module scope
const capturedProcessor = vi.hoisted(() => ({ current: null as unknown, opts: null as unknown }));

// DB mock chains — hoisted because worker.ts imports db at module scope
const mockDbUpdate = vi.hoisted(() => vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })));
const mockDbSelect = vi.hoisted(() => vi.fn());

// The queue seam: capture the processor the worker registers
vi.mock('@/lib/queue', () => ({
  createJobQueue: vi.fn((name: string) => ({
    name,
    add: vi.fn(),
    process: vi.fn((handler: unknown, opts: unknown) => {
      capturedProcessor.current = handler;
      capturedProcessor.opts = opts;
    }),
  })),
}));

vi.mock('@/lib/config', () => ({
  config: {
    queue: {
      routing: { concurrency: 1 },
    },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => mockDbSelect(),
    update: () => mockDbUpdate(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  adminInboxItems: { id: 'inbox.id', userId: 'inbox.userId', documentId: 'inbox.documentId' },
  adminDocuments: {
    id: 'docs.id',
    cleanedText: 'docs.cleanedText',
    aiSummary: 'docs.aiSummary',
    metadata: 'docs.metadata',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ _eq: { col, val } }),
}));

vi.mock('./router', () => ({
  buildWorkspaceMap: vi.fn(() =>
    Promise.resolve([
      { workspaceId: 1, workspaceTitle: 'Test WS', workspaceDescription: null, sections: [] },
    ])
  ),
  routeMaterial: vi.fn(() =>
    Promise.resolve([
      {
        workspaceId: 1,
        sectionId: 10,
        confidence: 0.9,
        action: 'append',
        suggestedContent: 'content',
        reasoning: 'fits',
        workspaceTitle: 'Test WS',
        sectionTitle: 'Section',
      },
    ])
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJob(inboxItemId: number) {
  return { data: { inboxItemId } };
}

/**
 * Set up DB mocks for a single processRouting invocation.
 *
 * Call order:
 *   1) Inbox item select: select().from().where()
 *   2) (optional) Document select: select().from().where()
 *   3) status 'processing' update (and subsequent updates)
 */
function setupInboxItem(item: Record<string, unknown>, doc?: Record<string, unknown> | null) {
  let callIndex = 0;

  mockDbSelect.mockImplementation(() => {
    const idx = callIndex++;

    if (idx === 0) {
      // Inbox item query
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(item ? [item] : [])),
        })),
      };
    }

    // Document query (only reached when item.documentId is set)
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(doc ? [doc] : [])),
      })),
    };
  });
}

function setupMissingInboxItem() {
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve([])),
    })),
  }));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processRouting (worker)', () => {
  it('TC-014 — happy path: processes inbox item with inline content', async () => {
    vi.resetModules();

    const item = { id: 1, content: 'material text', title: 'My Doc', userId: 5, documentId: null };
    setupInboxItem(item);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;

    await processor(makeJob(1));

    const { buildWorkspaceMap, routeMaterial } = await import('./router');

    // buildWorkspaceMap called with the item's userId
    expect(buildWorkspaceMap).toHaveBeenCalledWith(5);

    // routeMaterial called with item content (no enrichedMetadata)
    expect(routeMaterial).toHaveBeenCalledWith(
      'My Doc',
      'material text',
      expect.any(Array),
      undefined
    );

    // First update: status → 'processing'
    expect(mockDbUpdate).toHaveBeenCalled();
    const firstSetCall = vi.mocked(mockDbUpdate).mock.results[0]!.value.set;
    expect(firstSetCall).toHaveBeenCalledWith({ status: 'processing' });

    // Final update: status → 'routed'
    const lastSetCall =
      vi.mocked(mockDbUpdate).mock.results[vi.mocked(mockDbUpdate).mock.results.length - 1]!.value
        .set;
    expect(lastSetCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'routed',
        routingResults: expect.any(Array),
        processingError: null,
      })
    );
  });

  it('TC-015 — happy path: uses document cleanedText and metadata when documentId is set', async () => {
    vi.resetModules();

    const item = { id: 2, content: 'old content', title: 'File Doc', userId: 3, documentId: 10 };
    const metadata = {
      summary: 'meta summary',
      documentType: 'report',
      tags: [],
      entities: [],
      keyDecisions: [],
      actionItems: [],
    };
    const doc = { cleanedText: 'cleaned document text', aiSummary: 'summary', metadata };

    setupInboxItem(item, doc);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(2));

    const { routeMaterial } = await import('./router');

    // routeMaterial called with cleanedText (not old content)
    expect(routeMaterial).toHaveBeenCalledWith(
      'File Doc',
      'cleaned document text',
      expect.any(Array),
      metadata
    );
  });

  it('TC-016 — happy path: falls back to item.content when document has no cleanedText', async () => {
    vi.resetModules();

    const item = { id: 3, content: 'fallback content', title: 'My Doc', userId: 1, documentId: 5 };
    const doc = { cleanedText: null, aiSummary: null, metadata: null };

    setupInboxItem(item, doc);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(3));

    const { routeMaterial } = await import('./router');
    expect(routeMaterial).toHaveBeenCalledWith(
      'My Doc',
      'fallback content',
      expect.any(Array),
      undefined
    );
  });

  it('TC-017 — happy path: does not pass metadata as enrichedMetadata when metadata has no summary key', async () => {
    vi.resetModules();

    const item = { id: 4, content: 'text', title: 'Doc', userId: 2, documentId: 7 };
    const doc = { cleanedText: 'text', aiSummary: null, metadata: { someOtherKey: 'value' } };

    setupInboxItem(item, doc);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(4));

    const { routeMaterial } = await import('./router');
    // Fourth argument should be undefined (no summary key in metadata)
    expect(routeMaterial).toHaveBeenCalledWith('Doc', 'text', expect.any(Array), undefined);
  });

  it('TC-018 — error path: inbox item not found throws', async () => {
    vi.resetModules();
    setupMissingInboxItem();

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;

    await expect(processor(makeJob(99))).rejects.toThrow('Inbox item 99 not found');

    // No 'processing' status update should have been made — any db.update calls
    // would only be from the outer catch handler (failed status), not a 'processing' set
    const setMocks = vi.mocked(mockDbUpdate).mock.results.flatMap((r) => r.value.set.mock.calls);
    const processingCalls = setMocks.filter(
      (args) => Array.isArray(args) && args[0]?.status === 'processing'
    );
    expect(processingCalls).toHaveLength(0);
  });

  it('TC-019 — error path: blank content sets status to failed immediately', async () => {
    vi.resetModules();

    const item = { id: 5, content: '   ', title: 'Empty', userId: 1, documentId: null };
    setupInboxItem(item);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(5));

    const { buildWorkspaceMap, routeMaterial } = await import('./router');

    expect(buildWorkspaceMap).not.toHaveBeenCalled();
    expect(routeMaterial).not.toHaveBeenCalled();

    // Should have called update twice: once for 'processing', once for 'failed'
    // The final update sets failed status with the right error
    const lastSetCall =
      vi.mocked(mockDbUpdate).mock.results[vi.mocked(mockDbUpdate).mock.results.length - 1]!.value
        .set;
    expect(lastSetCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        processingError: 'No content to route',
        processedAt: expect.any(Date),
      })
    );
  });

  it('TC-020 — boundary: null content also fails (item.content is null and no document)', async () => {
    vi.resetModules();

    const item = { id: 6, content: null, title: 'Null Content', userId: 1, documentId: null };
    setupInboxItem(item);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(6));

    const { buildWorkspaceMap, routeMaterial } = await import('./router');

    expect(buildWorkspaceMap).not.toHaveBeenCalled();
    expect(routeMaterial).not.toHaveBeenCalled();

    const lastSetCall =
      vi.mocked(mockDbUpdate).mock.results[vi.mocked(mockDbUpdate).mock.results.length - 1]!.value
        .set;
    expect(lastSetCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        processingError: 'No content to route',
        processedAt: expect.any(Date),
      })
    );
  });

  it('TC-021 — error path: routeMaterial throws → sets failed status and re-throws', async () => {
    vi.resetModules();

    const item = { id: 7, content: 'valid content', title: 'Doc', userId: 1, documentId: null };
    setupInboxItem(item);

    await import('./worker');
    // Override routeMaterial to throw
    const { routeMaterial } = await import('./router');
    vi.mocked(routeMaterial).mockRejectedValueOnce(new Error('AI error'));

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;

    await expect(processor(makeJob(7))).rejects.toThrow('AI error');

    // The outer catch in the worker should have written a failed status
    const lastSetCall =
      vi.mocked(mockDbUpdate).mock.results[vi.mocked(mockDbUpdate).mock.results.length - 1]!.value
        .set;
    expect(lastSetCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        processingError: 'AI error',
        processedAt: expect.any(Date),
      })
    );
  });

  it('TC-022 — boundary: zero suggestions from routeMaterial sets status to failed', async () => {
    vi.resetModules();

    const item = { id: 8, content: 'valid content', title: 'Doc', userId: 1, documentId: null };
    setupInboxItem(item);

    await import('./worker');
    const { routeMaterial } = await import('./router');
    vi.mocked(routeMaterial).mockResolvedValueOnce([]);

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(8));

    const lastSetCall =
      vi.mocked(mockDbUpdate).mock.results[vi.mocked(mockDbUpdate).mock.results.length - 1]!.value
        .set;
    expect(lastSetCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        processingError: 'No suitable sections found',
      })
    );
  });

  it('TC-023 — boundary: userId is null → buildWorkspaceMap called with undefined', async () => {
    vi.resetModules();

    const item = { id: 9, content: 'valid content', title: 'Doc', userId: null, documentId: null };
    setupInboxItem(item);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(9));

    const { buildWorkspaceMap } = await import('./router');
    expect(buildWorkspaceMap).toHaveBeenCalledWith(undefined);
  });

  it('registers a processor on the workspace-routing queue on import', async () => {
    vi.resetModules();

    await import('./worker');

    const { createJobQueue } = await import('@/lib/queue');
    expect(createJobQueue).toHaveBeenCalledWith('workspace-routing', expect.any(Object));
    expect(capturedProcessor.current).toEqual(expect.any(Function));
    expect(capturedProcessor.opts).toEqual({ concurrency: 1 });
  });
});
