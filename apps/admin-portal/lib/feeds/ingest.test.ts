import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // Returning mocks for each insert type
  const mockDocReturning = vi.fn().mockResolvedValue([{ id: 10 }]);
  const mockInboxReturning = vi.fn().mockResolvedValue([{ id: 20 }]);
  const mockFeedItemValues = vi.fn().mockResolvedValue(undefined);

  // Table identity is determined by which schema symbol is passed to db.insert()
  // We'll track by the symbol identity of the first arg
  let insertCallCount = 0;

  const mockDbInsert = vi.fn((_table: unknown) => {
    const callIndex = insertCallCount++;
    // Pattern: per-item inserts cycle: 0=doc, 1=inbox, 2=feedItem (then repeats)
    const pos = callIndex % 3;
    const returningFn =
      pos === 0
        ? mockDocReturning
        : pos === 1
          ? mockInboxReturning
          : vi.fn().mockResolvedValue(undefined);
    return {
      values: vi.fn((_vals: unknown) => ({
        returning: returningFn,
        // feedItems insert calls .values() only (no .returning())
        // but we also need the values() call itself to be awaitable for feedItems
        then:
          pos === 2
            ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject)
            : undefined,
      })),
    };
  });

  const resetInsertCount = () => {
    insertCallCount = 0;
  };

  // Existing guids select result
  const mockExistingGuidsResult = vi.fn().mockResolvedValue([]);
  // Gap report select result
  const mockGapReportResult = vi.fn().mockResolvedValue([]);

  let selectCallCount = 0;

  const mockDbSelect = vi.fn((_cols?: unknown) => {
    const callIndex = selectCallCount++;
    // Call 0 = existingGuids check
    // Call 1 = gap report (when workspaceId set)
    // Otherwise existingGuids
    return {
      from: vi.fn(() => ({
        where: vi.fn((_cond: unknown) => {
          // Return a thenable so await works
          const existingPromise = mockExistingGuidsResult();
          // Attach orderBy/limit for gap report chain
          const result = Object.assign(existingPromise, {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => mockGapReportResult()),
            })),
          });
          return result;
        }),
      })),
    };
  });

  const resetSelectCount = () => {
    selectCallCount = 0;
  };

  return {
    mockDbInsert,
    mockDbSelect,
    mockDocReturning,
    mockInboxReturning,
    mockExistingGuidsResult,
    mockGapReportResult,
    resetInsertCount,
    resetSelectCount,
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => (mocks.mockDbSelect as (...a: unknown[]) => unknown)(...args),
    insert: (...args: unknown[]) => (mocks.mockDbInsert as (...a: unknown[]) => unknown)(...args),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ eq: { col, val } }),
  and: (...args: unknown[]) => ({ and: args }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: { col, vals } }),
  desc: (col: unknown) => ({ desc: col }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminDocuments: Symbol('adminDocuments'),
  adminInboxItems: Symbol('adminInboxItems'),
  adminFeedItems: Symbol('adminFeedItems'),
  adminGapReports: {
    id: 'gapReports.id',
    findings: 'gapReports.findings',
    workspaceId: 'gapReports.workspaceId',
    createdAt: 'gapReports.createdAt',
  },
}));

vi.mock('@/lib/document-processing/queue', () => ({
  queueDocument: vi.fn(() => Promise.resolve()),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFeed(
  overrides: Partial<{
    id: number;
    userId: number;
    url: string;
    type: 'rss' | 'page';
    workspaceId: number | null;
    lastFetchedAt: Date | null;
    lastContentHash: string | null;
  }> = {}
) {
  return {
    id: 1,
    userId: 42,
    url: 'https://feeds.example.com/rss',
    type: 'rss' as const,
    workspaceId: null,
    lastFetchedAt: null,
    lastContentHash: null,
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<{
    guid: string;
    title: string;
    link: string;
    content: string;
    pubDate?: Date;
  }> = {}
) {
  return {
    guid: 'g-default',
    title: 'Default Title',
    link: 'https://example.com/default',
    content: 'default content',
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resetInsertCount();
  mocks.resetSelectCount();
  // Default: no existing guids, no gap report
  mocks.mockExistingGuidsResult.mockResolvedValue([]);
  mocks.mockGapReportResult.mockResolvedValue([]);
  // Default: successful inserts
  mocks.mockDocReturning.mockResolvedValue([{ id: 10 }]);
  mocks.mockInboxReturning.mockResolvedValue([{ id: 20 }]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ingestFeedItems', () => {
  // ── TC-008-INGEST-01 — Zero items returns 0 immediately ──────────────────

  it('TC-008-INGEST-01: zero items input returns 0 immediately without DB queries', async () => {
    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed();

    const count = await ingestFeedItems(feed, []);

    expect(count).toBe(0);
    expect(mocks.mockDbSelect).not.toHaveBeenCalled();
    expect(mocks.mockDbInsert).not.toHaveBeenCalled();
  });

  // ── TC-008-INGEST-02 — All items already exist: nothing ingested ──────────

  it('TC-008-INGEST-02: all items already exist, nothing ingested', async () => {
    mocks.mockExistingGuidsResult.mockResolvedValueOnce([{ guid: 'g1' }]);

    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed();
    const items = [
      makeItem({ guid: 'g1', title: 'A', link: 'https://a.com', content: 'content a' }),
    ];

    const count = await ingestFeedItems(feed, items);

    expect(count).toBe(0);
    expect(mocks.mockDbInsert).not.toHaveBeenCalled();
  });

  // ── TC-008-INGEST-03 — New item: all records created, document queued ─────

  it('TC-008-INGEST-03: new item creates document, inbox item, feed-item record and queues document', async () => {
    const { ingestFeedItems } = await import('./ingest');
    const { queueDocument } = await import('@/lib/document-processing/queue');
    const feed = makeFeed({ workspaceId: null });
    const items = [
      makeItem({
        guid: 'g-new',
        title: 'New Article',
        link: 'https://b.com',
        content: 'fresh content',
      }),
    ];

    const count = await ingestFeedItems(feed, items);

    expect(count).toBe(1);

    // 3 inserts: adminDocuments, adminInboxItems, adminFeedItems
    expect(mocks.mockDbInsert).toHaveBeenCalledTimes(3);

    // Document insert values
    const docValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[0]!.value.values;
    expect(docValuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: feed.userId,
        title: 'New Article',
        source: 'feed',
        sourceUrl: 'https://b.com',
        rawText: 'fresh content',
        status: 'uploaded',
        mimeType: 'text/plain',
      })
    );

    // Inbox insert values
    const inboxValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[1]!.value.values;
    expect(inboxValuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'feed',
        title: 'New Article',
        documentId: 10,
        status: 'pending',
        gapFindingRef: null,
      })
    );

    // Feed item dedup insert values
    const feedItemValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[2]!.value.values;
    expect(feedItemValuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        feedId: feed.id,
        guid: 'g-new',
        inboxItemId: 20,
      })
    );

    // queueDocument called with the document ID
    expect(queueDocument).toHaveBeenCalledWith(10);
  });

  // ── TC-008-INGEST-04 — Item with no title uses 'Feed Item' fallback ───────

  it('TC-008-INGEST-04: item with empty title falls back to "Feed Item"', async () => {
    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed();
    const items = [makeItem({ guid: 'g2', title: '', link: '', content: 'body' })];

    await ingestFeedItems(feed, items);

    const docValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[0]!.value.values;
    expect(docValuesCall).toHaveBeenCalledWith(expect.objectContaining({ title: 'Feed Item' }));

    const inboxValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[1]!.value.values;
    expect(inboxValuesCall).toHaveBeenCalledWith(expect.objectContaining({ title: 'Feed Item' }));
  });

  // ── TC-008-INGEST-05 — Gap keyword matching attaches gapFindingRef ────────

  it('TC-008-INGEST-05: gap keyword matching attaches gapFindingRef when 2+ words match', async () => {
    mocks.mockGapReportResult.mockResolvedValueOnce([
      {
        id: 3,
        findings: [
          { issue: 'missing pricing strategy data', sectionId: null, severity: 'warning' },
        ],
      },
    ]);

    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed({ workspaceId: 7 });
    const items = [
      makeItem({
        guid: 'g3',
        title: 'Pricing strategy analysis',
        content: 'Covers pricing and strategy for the year.',
        link: '',
      }),
    ];

    const count = await ingestFeedItems(feed, items);

    expect(count).toBe(1);

    const inboxValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[1]!.value.values;
    expect(inboxValuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        gapFindingRef: { gapReportId: 3, findingIndex: 0, workspaceId: 7 },
      })
    );
  });

  // ── TC-008-INGEST-06 — Gap keyword: fewer than 2 matches → no match ───────

  it('TC-008-INGEST-06: gap keyword matching with fewer than 2 matching words returns null', async () => {
    mocks.mockGapReportResult.mockResolvedValueOnce([
      {
        id: 3,
        findings: [
          { issue: 'missing pricing strategy data', sectionId: null, severity: 'warning' },
        ],
      },
    ]);

    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed({ workspaceId: 7 });
    const items = [
      makeItem({
        guid: 'g4',
        title: 'Weather report',
        content: 'General news article about nothing relevant.',
        link: '',
      }),
    ];

    await ingestFeedItems(feed, items);

    const inboxValuesCall = vi.mocked(mocks.mockDbInsert).mock.results[1]!.value.values;
    expect(inboxValuesCall).toHaveBeenCalledWith(expect.objectContaining({ gapFindingRef: null }));
  });

  // ── TC-008-INGEST-07 — Mixed new and duplicate items: only new ones ingested

  it('TC-008-INGEST-07: mixed new and duplicate items — only new ones ingested', async () => {
    mocks.mockExistingGuidsResult.mockResolvedValueOnce([{ guid: 'old' }]);

    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed();
    const items = [
      makeItem({ guid: 'old', title: 'Old', content: 'old body' }),
      makeItem({ guid: 'new', title: 'New', content: 'new body' }),
    ];

    const count = await ingestFeedItems(feed, items);

    expect(count).toBe(1);
    // 3 inserts for 1 new item: documents + inboxItems + feedItems
    expect(mocks.mockDbInsert).toHaveBeenCalledTimes(3);
  });

  // ── TC-008-INGEST-08 — Document insert failure: item skipped ─────────────

  it('TC-008-INGEST-08: document insert failure (returns []) skips item and does not increment count', async () => {
    mocks.mockDocReturning.mockResolvedValueOnce([]);

    const { ingestFeedItems } = await import('./ingest');
    const { queueDocument } = await import('@/lib/document-processing/queue');
    const feed = makeFeed();
    const items = [makeItem({ guid: 'g-fail', content: 'content' })];

    const count = await ingestFeedItems(feed, items);

    expect(count).toBe(0);
    // Only the document insert attempted, inbox insert skipped
    expect(mocks.mockDbInsert).toHaveBeenCalledTimes(1);
    expect(queueDocument).not.toHaveBeenCalled();
  });

  // ── TC-008-INGEST-09 — Feed without workspaceId skips gap report query ────

  it('TC-008-INGEST-09: feed without workspaceId skips gap report DB query', async () => {
    const { ingestFeedItems } = await import('./ingest');
    const feed = makeFeed({ workspaceId: null });
    const items = [makeItem({ guid: 'g5', content: 'body' })];

    await ingestFeedItems(feed, items);

    // Gap report result mock should not have been invoked
    expect(mocks.mockGapReportResult).not.toHaveBeenCalled();
  });
});
