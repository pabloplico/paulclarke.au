import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { capturedProcessor, mockDbSelect, mockDbUpdate, mockUpsertJobScheduler } = vi.hoisted(() => {
  const capturedProcessor = { current: null as null | ((job: unknown) => Promise<unknown>) };

  const mockUpsertJobScheduler = vi.fn();

  const mockDbSelectResult = { current: [] as unknown[] };
  const mockDbSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(mockDbSelectResult.current)),
    })),
  }));

  const mockDbUpdate = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  }));

  return {
    capturedProcessor,
    mockDbSelect,
    mockDbSelectResult,
    mockDbUpdate,
    mockUpsertJobScheduler,
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  Worker: vi.fn((_name: string, processor: (job: unknown) => Promise<unknown>, _opts: unknown) => {
    capturedProcessor.current = processor;
    return { on: vi.fn() };
  }),
  Queue: vi.fn(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    on: vi.fn(),
  })),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => (mockDbSelect as (...a: unknown[]) => unknown)(...args),
    update: (...args: unknown[]) => (mockDbUpdate as (...a: unknown[]) => unknown)(...args),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ eq: { col, val } }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminFeeds: {
    id: 'adminFeeds.id',
    enabled: 'adminFeeds.enabled',
  },
}));

vi.mock('./fetcher', () => ({
  fetchFeed: vi.fn(),
}));

vi.mock('./ingest', () => ({
  ingestFeedItems: vi.fn(),
}));

vi.mock('./queue', () => ({
  feedQueue: {
    upsertJobScheduler: mockUpsertJobScheduler,
    on: vi.fn(),
  },
}));

vi.mock('@/lib/config', () => ({
  config: {
    queue: {
      feedMonitor: {
        concurrency: 1,
        attempts: 3,
        backoffDelay: 5000,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFeedRow(
  overrides: Partial<{
    id: number;
    userId: number;
    url: string;
    type: string;
    label: string | null;
    workspaceId: number | null;
    enabled: boolean;
    lastFetchedAt: Date | null;
    lastContentHash: string | null;
  }> = {}
) {
  return {
    id: 1,
    userId: 1,
    url: 'https://feeds.example.com/rss',
    type: 'rss',
    label: null,
    workspaceId: null,
    enabled: true,
    lastFetchedAt: null,
    lastContentHash: null,
    ...overrides,
  };
}

function makeJob(id = 'job-1') {
  return { id };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedProcessor.current = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('feeds worker', () => {
  // ── TC-008-WORKER-01 — Registers BullMQ worker and scheduler on import ───

  it('TC-008-WORKER-01: registers BullMQ Worker and upsertJobScheduler on import', async () => {
    vi.resetModules();
    await import('./worker');

    const { Worker } = await import('bullmq');
    expect(Worker).toHaveBeenCalledWith(
      'feed-monitor',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    );

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      'feed-check',
      { pattern: '*/15 * * * *' },
      { name: 'check-feeds' }
    );

    expect(capturedProcessor.current).toBeDefined();
  });

  // ── TC-008-WORKER-02 — No enabled feeds returns { checked: 0, ingested: 0 }

  it('TC-008-WORKER-02: no enabled feeds returns { checked: 0, ingested: 0 }', async () => {
    vi.resetModules();
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    }));

    await import('./worker');
    const processor = capturedProcessor.current!;

    const result = await processor(makeJob());

    expect(result).toEqual({ checked: 0, ingested: 0 });

    const { fetchFeed } = await import('./fetcher');
    const { ingestFeedItems } = await import('./ingest');
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(ingestFeedItems).not.toHaveBeenCalled();
  });

  // ── TC-008-WORKER-03 — Two feeds: correct aggregated counts ──────────────

  it('TC-008-WORKER-03: two feeds processed with correct aggregated counts', async () => {
    vi.resetModules();

    const feed1 = makeFeedRow({ id: 1, url: 'https://feed1.example.com' });
    const feed2 = makeFeedRow({ id: 2, url: 'https://feed2.example.com' });

    mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([feed1, feed2])),
      })),
    }));

    await import('./worker');

    const { fetchFeed } = await import('./fetcher');
    const { ingestFeedItems } = await import('./ingest');

    const mockItem = { guid: 'g1', title: 'Item', link: 'https://x.com', content: 'body' };
    vi.mocked(fetchFeed)
      .mockResolvedValueOnce({ items: [mockItem], contentHash: 'abc' })
      .mockResolvedValueOnce({ items: [mockItem], contentHash: 'abc' });
    vi.mocked(ingestFeedItems).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const processor = capturedProcessor.current!;
    const result = await processor(makeJob());

    expect(result).toEqual({ checked: 2, ingested: 3 });

    // DB update called twice with lastContentHash and lastError: null
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
    const setArgs = vi
      .mocked(mockDbUpdate)
      .mock.results.map((r: any) => r.value.set.mock.calls[0]![0]);
    for (const args of setArgs) {
      expect(args).toMatchObject({
        lastFetchedAt: expect.any(Date),
        lastContentHash: 'abc',
        lastError: null,
      });
    }
  });

  // ── TC-008-WORKER-04 — Feed fetch error: lastError recorded, continues ───

  it('TC-008-WORKER-04: feed fetch error records lastError and continues to next feed', async () => {
    vi.resetModules();

    const feed1 = makeFeedRow({ id: 1, url: 'https://feed1.example.com' });
    const feed2 = makeFeedRow({ id: 2, url: 'https://feed2.example.com' });

    mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([feed1, feed2])),
      })),
    }));

    await import('./worker');

    const { fetchFeed } = await import('./fetcher');
    const { ingestFeedItems } = await import('./ingest');

    const mockItem = { guid: 'g2', title: 'Item 2', link: 'https://x.com', content: 'body 2' };
    vi.mocked(fetchFeed)
      .mockRejectedValueOnce(new Error('DNS failure'))
      .mockResolvedValueOnce({ items: [mockItem], contentHash: 'def' });
    vi.mocked(ingestFeedItems).mockResolvedValueOnce(1);

    const processor = capturedProcessor.current!;

    // Processor should resolve (not throw)
    const result = await processor(makeJob());

    expect(result).toEqual({ checked: 2, ingested: 1 });

    // Two DB updates: one for each feed
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);

    const setArgs = vi
      .mocked(mockDbUpdate)
      .mock.results.map((r: any) => r.value.set.mock.calls[0]![0]);

    // First feed: has lastError, lastFetchedAt, no lastContentHash
    expect(setArgs[0]).toMatchObject({
      lastError: 'DNS failure',
      lastFetchedAt: expect.any(Date),
    });

    // Second feed: has lastError: null
    expect(setArgs[1]).toMatchObject({
      lastError: null,
    });
  });
});
