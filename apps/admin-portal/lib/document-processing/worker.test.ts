import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const capturedProcessor = vi.hoisted(() => ({ current: null as unknown }));

const mockDbUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
const mockDbDelete = vi.fn(() => ({ where: vi.fn() }));
const mockDbInsert = vi.fn(() => ({ values: vi.fn() }));
const mockDbSelectResult = vi.hoisted(() => ({ current: [] as unknown[] }));
const mockDbSelect = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve(mockDbSelectResult.current)),
  })),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn((_name: string, processor: unknown) => {
    capturedProcessor.current = processor;
    return { on: vi.fn() };
  }),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  config: {
    queue: {
      documentProcessing: { concurrency: 1 },
    },
  },
}));

vi.mock('@/lib/config.server', () => ({
  loadConfig: vi.fn(() => Promise.resolve({ aiProvider: 'openai', aiModel: 'gpt-4o' })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => mockDbSelect(),
    update: () => mockDbUpdate(),
    delete: () => mockDbDelete(),
    insert: () => mockDbInsert(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  adminDocuments: { id: 'docs.id' },
  adminDocumentChunks: {
    id: 'chunks.id',
    documentId: 'chunks.documentId',
    chunkIndex: 'chunks.chunkIndex',
  },
  adminInboxItems: { id: 'inbox.id', documentId: 'inbox.documentId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ eq: { col, val } }),
}));

vi.mock('@/lib/rag/chunker', () => ({
  chunkText: vi.fn(() => [
    { content: 'chunk one', index: 0, metadata: {} },
    { content: 'chunk two', index: 1, metadata: {} },
  ]),
}));

vi.mock('@/lib/rag/embeddings', () => ({
  generateEmbeddings: vi.fn(() => Promise.resolve([[0.1], [0.2]])),
}));

vi.mock('@/lib/storage', () => ({
  storage: {
    read: vi.fn(() => Promise.resolve(Buffer.from('file content'))),
  },
}));

vi.mock('./chunk-analysis', () => ({
  analyzeAllChunks: vi.fn(() =>
    Promise.resolve({
      analyses: new Map([
        [0, { claims: [] }],
        [1, { claims: [] }],
      ]),
      droppedChunks: 0,
      totalChunks: 2,
    })
  ),
}));

vi.mock('./cleaner', () => ({
  cleanText: vi.fn((text: string) => text.trim()),
}));

vi.mock('./metadata', () => ({
  extractMetadata: vi.fn(() =>
    Promise.resolve({
      summary: 'basic summary',
      suggestedTitle: 'Basic Title',
      tags: ['tag'],
      language: 'en',
      documentType: 'report',
    })
  ),
  extractEnrichedMetadata: vi.fn(() =>
    Promise.resolve({
      summary: 'enriched summary',
      suggestedTitle: 'Enriched Title',
      tags: ['tag1', 'tag2'],
      language: 'en',
      documentType: 'policy',
    })
  ),
}));

vi.mock('./parsers', () => ({
  getParser: vi.fn(() => vi.fn(() => Promise.resolve({ text: 'parsed text', pageCount: 3 }))),
}));

vi.mock('./quality-gates', () => ({
  checkCleaningQuality: vi.fn(() => []),
  checkChunkingQuality: vi.fn(() => []),
  checkExtractionQuality: vi.fn(() => []),
}));

vi.mock('./url-fetcher', () => ({
  fetchUrlContent: vi.fn(() =>
    Promise.resolve({ text: 'fetched content', title: 'Fetched Title' })
  ),
}));

vi.mock('@/lib/workspace-routing/queue', () => ({
  queueRouting: vi.fn(() => Promise.resolve()),
}));

// ── Setup ──────────────────────────────────────────────────────────────────

function makeJob(documentId: number) {
  return {
    data: { documentId },
    updateProgress: vi.fn(),
  };
}

function makeJobWithDiscard(documentId: number) {
  return {
    data: { documentId },
    updateProgress: vi.fn(),
    discard: vi.fn(),
  };
}

/**
 * Collect every argument object passed to each .set() call across all db.update() chains.
 * Works because mockDbUpdate() returns a fresh { set: vi.fn() } per call, and those
 * return values are stored in mockUpdate.mock.results.
 */
function captureSetArgs(mockUpdate: ReturnType<typeof vi.fn>): unknown[] {
  return mockUpdate.mock.results
    .map(
      (r: { value?: { set?: { mock?: { calls?: unknown[][] } } } }) =>
        r.value?.set?.mock?.calls ?? []
    )
    .flat(2);
}

function setupDbForDoc(doc: Record<string, unknown>) {
  // First select returns the document, subsequent selects return chunk IDs or inbox items
  let callCount = 0;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([doc]);
        if (callCount <= 3)
          return Promise.resolve([
            { id: 1, chunkIndex: 0 },
            { id: 2, chunkIndex: 1 },
          ]);
        // Last select: inbox items (none by default)
        return Promise.resolve([]);
      }),
    })),
  }));
}

/**
 * Like setupDbForDoc but the final DB select (inbox-item lookup) returns the given inbox rows.
 * selectCount specifies how many intermediate chunk selects to handle before returning inbox rows
 * (defaults to 2, matching the standard 2-chunk pipeline).
 */
function setupDbForDocWithInbox(
  doc: Record<string, unknown>,
  inboxRows: unknown[],
  chunkRows: unknown[] = [
    { id: 1, chunkIndex: 0 },
    { id: 2, chunkIndex: 1 },
  ]
) {
  let callCount = 0;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([doc]);
        // calls 2 and 3 are the two chunk-id fetches (after insert and after embed)
        if (callCount <= 3) return Promise.resolve(chunkRows);
        // final call: inbox item lookup
        return Promise.resolve(inboxRows);
      }),
    })),
  }));
}

/**
 * Like setupDbForDoc but the second select (inbox item fallback for note/feed without rawText)
 * returns the given inbox content rows.
 */
function setupDbForNoteWithFallback(doc: Record<string, unknown>, inboxContentRows: unknown[]) {
  let callCount = 0;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([doc]);
        // second call: fallback inbox item content query
        if (callCount === 2) return Promise.resolve(inboxContentRows);
        // subsequent calls: chunk id fetches
        if (callCount <= 4)
          return Promise.resolve([
            { id: 1, chunkIndex: 0 },
            { id: 2, chunkIndex: 1 },
          ]);
        // final: inbox routing item (none)
        return Promise.resolve([]);
      }),
    })),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelectResult.current = [];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('document processing worker', () => {
  it('registers a worker processor on import', async () => {
    vi.resetModules();
    await import('./worker');

    const { Worker } = await import('bullmq');
    expect(Worker).toHaveBeenCalledWith(
      'document-processing',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    );
    expect(capturedProcessor.current).toBeDefined();
  });

  it('processes a file-source document through all stages', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 1,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'test.pdf',
      filePath: 'uploads/test.pdf',
      title: 'test.pdf',
    });

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJob(1);

    await processor(job);

    // Should progress through all 6 stages
    expect(job.updateProgress).toHaveBeenCalledWith(1);
    expect(job.updateProgress).toHaveBeenCalledWith(2);
    expect(job.updateProgress).toHaveBeenCalledWith(3);
    expect(job.updateProgress).toHaveBeenCalledWith(4);
    expect(job.updateProgress).toHaveBeenCalledWith(5);
    expect(job.updateProgress).toHaveBeenCalledWith(6);

    // Parser should have been used
    const { getParser } = await import('./parsers');
    expect(getParser).toHaveBeenCalledWith('application/pdf', 'test.pdf');

    // Chunks should have been generated
    const { chunkText } = await import('@/lib/rag/chunker');
    expect(chunkText).toHaveBeenCalled();

    // Embeddings should have been generated
    const { generateEmbeddings } = await import('@/lib/rag/embeddings');
    expect(generateEmbeddings).toHaveBeenCalledWith(['chunk one', 'chunk two']);
  });

  it('processes URL source by fetching content', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 2,
      source: 'url',
      sourceUrl: 'https://example.com',
      title: 'https://example.com',
    });

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(2));

    const { fetchUrlContent } = await import('./url-fetcher');
    expect(fetchUrlContent).toHaveBeenCalledWith('https://example.com');
  });

  it('processes note source using rawText', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 3,
      source: 'note',
      rawText: 'My note content',
    });

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(3));

    const { cleanText } = await import('./cleaner');
    expect(cleanText).toHaveBeenCalledWith('My note content');
  });

  it('throws when document not found', async () => {
    vi.resetModules();
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    }));

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;

    await expect(processor(makeJob(999))).rejects.toThrow('Document 999 not found');
  });

  // ── TC-005-01 — Stage ordering is strictly sequential ───────────────────

  it('TC-005-01: progress advances in strict order 1→2→3→4→5→6', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 1,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'test.pdf',
      filePath: 'uploads/test.pdf',
      title: 'test.pdf',
    });

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJob(1);

    await processor(job);

    expect(job.updateProgress).toHaveBeenNthCalledWith(1, 1);
    expect(job.updateProgress).toHaveBeenNthCalledWith(2, 2);
    expect(job.updateProgress).toHaveBeenNthCalledWith(3, 3);
    expect(job.updateProgress).toHaveBeenNthCalledWith(4, 4);
    expect(job.updateProgress).toHaveBeenNthCalledWith(5, 5);
    expect(job.updateProgress).toHaveBeenNthCalledWith(6, 6);
    expect(job.updateProgress).toHaveBeenCalledTimes(6);
  });

  // ── TC-005-02 — PermanentProcessingError: job discarded, not re-thrown ──

  it('TC-005-02: PermanentProcessingError → job.discard() called, processor resolves', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 1,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'test.pdf',
      filePath: 'uploads/test.pdf',
      title: 'test.pdf',
    });

    await import('./worker');
    // Import error classes AFTER resetModules so they match the worker's module instance
    const { PermanentProcessingError } = await import('./errors');
    const { getParser } = await import('./parsers');
    // Use mockReturnValueOnce so the override only applies for this test's processor call
    vi.mocked(getParser).mockReturnValueOnce(
      vi.fn(() => {
        throw new PermanentProcessingError('unsupported mime', 'UNSUPPORTED_TYPE', 'extract');
      })
    );

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJobWithDiscard(1);

    await expect(processor(job)).resolves.toBeUndefined();
    expect(job.discard).toHaveBeenCalledTimes(1);

    const setArgs = captureSetArgs(mockDbUpdate);
    const errorArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'processingError' in (a as object)
    );
    expect(errorArg).toBeDefined();
    const parsed = JSON.parse(errorArg!.processingError as string);
    expect(parsed).toMatchObject({
      code: 'UNSUPPORTED_TYPE',
      message: 'unsupported mime',
      permanent: true,
      stage: 'extract',
    });
  });

  // ── TC-005-03 — TransientProcessingError: re-thrown, discard NOT called ─

  it('TC-005-03: TransientProcessingError → re-thrown, job.discard not called', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 1,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'test.pdf',
      filePath: 'uploads/test.pdf',
      title: 'test.pdf',
    });

    await import('./worker');
    // Import error class AFTER resetModules so instanceof checks work in the worker
    const { TransientProcessingError } = await import('./errors');
    const { generateEmbeddings } = await import('@/lib/rag/embeddings');
    vi.mocked(generateEmbeddings).mockRejectedValueOnce(
      new TransientProcessingError('rate limit', 'RATE_LIMIT', 'embedding')
    );

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJobWithDiscard(1);

    await expect(processor(job)).rejects.toThrow('rate limit');
    expect(job.discard).not.toHaveBeenCalled();

    const setArgs = captureSetArgs(mockDbUpdate);
    const errorArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'processingError' in (a as object)
    );
    expect(errorArg).toBeDefined();
    const parsed = JSON.parse(errorArg!.processingError as string);
    expect(parsed).toMatchObject({ permanent: false, code: 'RATE_LIMIT' });
  });

  // ── TC-005-04 — Generic error: code 'UNKNOWN', stage undefined ───────────

  it('TC-005-04: generic TypeError → code UNKNOWN, permanent false, job.discard not called', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 1,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'test.pdf',
      filePath: 'uploads/test.pdf',
      title: 'test.pdf',
    });

    await import('./worker');
    const { cleanText } = await import('./cleaner');
    vi.mocked(cleanText).mockImplementationOnce(() => {
      throw new TypeError('bad input');
    });

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJobWithDiscard(1);

    await expect(processor(job)).rejects.toThrow('bad input');
    expect(job.discard).not.toHaveBeenCalled();

    const setArgs = captureSetArgs(mockDbUpdate);
    const errorArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'processingError' in (a as object)
    );
    expect(errorArg).toBeDefined();
    const parsed = JSON.parse(errorArg!.processingError as string);
    expect(parsed).toMatchObject({ code: 'UNKNOWN', permanent: false });
    // stage should not be set (undefined serialises to absent key)
    expect(parsed.stage).toBeUndefined();
  });

  // ── TC-005-05 — Feed source with rawText uses rawText directly ───────────

  it('TC-005-05: feed source with rawText passes rawText to cleanText', async () => {
    vi.resetModules();
    setupDbForDoc({ id: 4, source: 'feed', rawText: 'feed article content' });

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJobWithDiscard(4);

    await processor(job);

    const { cleanText } = await import('./cleaner');
    expect(cleanText).toHaveBeenCalledWith('feed article content');

    const { fetchUrlContent } = await import('./url-fetcher');
    expect(fetchUrlContent).not.toHaveBeenCalled();

    const { storage } = await import('@/lib/storage');
    expect(storage.read).not.toHaveBeenCalled();

    expect(job.updateProgress).toHaveBeenCalledTimes(6);
  });

  // ── TC-005-06 — Feed source without rawText falls back to inbox item ─────

  it('TC-005-06: feed source without rawText falls back to inbox item content', async () => {
    vi.resetModules();
    setupDbForNoteWithFallback({ id: 5, source: 'feed', rawText: null }, [
      { content: 'inbox article text' },
    ]);

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJobWithDiscard(5));

    const { cleanText } = await import('./cleaner');
    expect(cleanText).toHaveBeenCalledWith('inbox article text');

    const { fetchUrlContent } = await import('./url-fetcher');
    expect(fetchUrlContent).not.toHaveBeenCalled();

    const { storage } = await import('@/lib/storage');
    expect(storage.read).not.toHaveBeenCalled();
  });

  // ── TC-005-07 — Note without rawText and no inbox item → PermanentProcessingError ──

  it('TC-005-07: note without rawText and no inbox item → job.discard, NO_CONTENT error', async () => {
    vi.resetModules();
    // Doc is note with no rawText; inbox item lookup returns empty
    setupDbForNoteWithFallback(
      { id: 6, source: 'note', rawText: null },
      [] // no inbox item content
    );

    await import('./worker');
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJobWithDiscard(6);

    await expect(processor(job)).resolves.toBeUndefined();
    expect(job.discard).toHaveBeenCalledTimes(1);

    const setArgs = captureSetArgs(mockDbUpdate);
    const errorArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'processingError' in (a as object)
    );
    expect(errorArg).toBeDefined();
    const parsed = JSON.parse(errorArg!.processingError as string);
    expect(parsed).toMatchObject({ code: 'NO_CONTENT', permanent: true, stage: 'extract' });
  });

  // ── TC-005-08 — PDF exceeding page limit → PermanentProcessingError ──────

  it('TC-005-08: PDF over page limit → job.discard, PAGE_LIMIT_EXCEEDED, pipeline aborted before chunking', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 7,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'big.pdf',
      filePath: 'uploads/big.pdf',
      title: 'big.pdf',
    });

    await import('./worker');

    const { getParser } = await import('./parsers');
    // Use mockReturnValueOnce to avoid polluting subsequent tests
    vi.mocked(getParser).mockReturnValueOnce(
      vi.fn(() => Promise.resolve({ text: 'lots of text', pageCount: 201 }))
    );

    const { loadConfig } = await import('@/lib/config.server');
    vi.mocked(loadConfig).mockResolvedValueOnce({
      aiProvider: 'openai',
      aiModel: 'gpt-4o',
      upload: { maxPdfPages: 200 },
    } as unknown as Awaited<ReturnType<typeof loadConfig>>);

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    const job = makeJobWithDiscard(7);

    await expect(processor(job)).resolves.toBeUndefined();
    expect(job.discard).toHaveBeenCalledTimes(1);

    const setArgs = captureSetArgs(mockDbUpdate);
    const errorArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'processingError' in (a as object)
    );
    expect(errorArg).toBeDefined();
    const parsed = JSON.parse(errorArg!.processingError as string);
    expect(parsed).toMatchObject({
      code: 'PAGE_LIMIT_EXCEEDED',
      permanent: true,
      stage: 'extract',
    });

    const { chunkText } = await import('@/lib/rag/chunker');
    expect(chunkText).not.toHaveBeenCalled();
  });

  // ── TC-005-09 — URL title updated when fetched title differs from sourceUrl ─

  it('TC-005-09: URL source updates document title when fetched title differs from sourceUrl', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 8,
      source: 'url',
      sourceUrl: 'https://example.com',
      title: 'https://example.com',
    });

    await import('./worker');
    // Default fetchUrlContent mock returns { text: 'fetched content', title: 'Fetched Title' }
    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJob(8));

    const setArgs = captureSetArgs(mockDbUpdate);
    expect(setArgs).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Fetched Title' })])
    );
  });

  // ── TC-005-10 — Quality flags written to inbox item ──────────────────────

  it('TC-005-10: quality flags are written to inbox item when present', async () => {
    vi.resetModules();
    setupDbForDocWithInbox(
      {
        id: 1,
        source: 'file',
        mimeType: 'application/pdf',
        filename: 'test.pdf',
        filePath: 'uploads/test.pdf',
        title: 'test.pdf',
      },
      [{ id: 99 }]
    );

    await import('./worker');

    const { checkCleaningQuality } = await import('./quality-gates');
    const flag = {
      stage: 'clean',
      severity: 'warning',
      code: 'low_retention',
      message: 'cleaned text too short',
      details: {},
    };
    vi.mocked(checkCleaningQuality).mockReturnValueOnce([flag] as ReturnType<
      typeof checkCleaningQuality
    >);

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJobWithDiscard(1));

    const setArgs = captureSetArgs(mockDbUpdate);
    const flagsArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'qualityFlags' in (a as object)
    );
    expect(flagsArg).toBeDefined();
    const flags = flagsArg!.qualityFlags as unknown[];
    expect(flags).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'low_retention' })])
    );
  });

  // ── TC-005-11 — Routing queue called; failure is swallowed ───────────────

  describe('TC-005-11: routing queue behaviour when inbox item exists', () => {
    it('Scenario A: queueRouting is called with the inbox item id and force=true', async () => {
      vi.resetModules();
      setupDbForDocWithInbox(
        {
          id: 1,
          source: 'file',
          mimeType: 'application/pdf',
          filename: 'test.pdf',
          filePath: 'uploads/test.pdf',
          title: 'test.pdf',
        },
        [{ id: 99 }]
      );

      await import('./worker');
      const { queueRouting } = await import('@/lib/workspace-routing/queue');
      vi.mocked(queueRouting).mockResolvedValueOnce(undefined);

      const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
      await processor(makeJobWithDiscard(1));

      // force=true gives each run a unique BullMQ job id, so reprocessing a
      // document re-routes its inbox item instead of being deduplicated
      expect(queueRouting).toHaveBeenCalledWith(99, true);
    });

    it('Scenario B: queueRouting failure is swallowed, processor resolves', async () => {
      vi.resetModules();
      setupDbForDocWithInbox(
        {
          id: 1,
          source: 'file',
          mimeType: 'application/pdf',
          filename: 'test.pdf',
          filePath: 'uploads/test.pdf',
          title: 'test.pdf',
        },
        [{ id: 99 }]
      );

      await import('./worker');
      const { queueRouting } = await import('@/lib/workspace-routing/queue');
      vi.mocked(queueRouting).mockRejectedValueOnce(new Error('redis down'));

      const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
      const job = makeJobWithDiscard(1);

      await expect(processor(job)).resolves.toBeUndefined();
      expect(queueRouting).toHaveBeenCalled();
      expect(job.discard).not.toHaveBeenCalled();
    });
  });

  // ── TC-005-12 — Empty document (no chunks) calls extractMetadata ─────────

  it('TC-005-12: empty document (no chunks) calls extractMetadata instead of analyzeAllChunks', async () => {
    vi.resetModules();
    setupDbForDoc({
      id: 1,
      source: 'file',
      mimeType: 'application/pdf',
      filename: 'test.pdf',
      filePath: 'uploads/test.pdf',
      title: 'test.pdf',
    });

    await import('./worker');

    const { chunkText } = await import('@/lib/rag/chunker');
    vi.mocked(chunkText).mockReturnValueOnce([]);

    const { analyzeAllChunks } = await import('./chunk-analysis');
    const { extractMetadata } = await import('./metadata');

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJobWithDiscard(1));

    expect(analyzeAllChunks).not.toHaveBeenCalled();
    expect(extractMetadata).toHaveBeenCalledTimes(1);

    // The final updateDocumentStatus call should include aiSummary from extractMetadata mock
    const setArgs = captureSetArgs(mockDbUpdate);
    expect(setArgs).toEqual(
      expect.arrayContaining([expect.objectContaining({ aiSummary: 'basic summary' })])
    );
  });

  // ── TC-005-13 — droppedChunks > 0 pushes chunks_dropped quality flag ─────

  it('TC-005-13: droppedChunks > 0 pushes chunks_dropped quality flag to inbox item', async () => {
    vi.resetModules();
    setupDbForDocWithInbox(
      {
        id: 1,
        source: 'file',
        mimeType: 'application/pdf',
        filename: 'test.pdf',
        filePath: 'uploads/test.pdf',
        title: 'test.pdf',
      },
      [{ id: 99 }]
    );

    await import('./worker');

    const { analyzeAllChunks } = await import('./chunk-analysis');
    vi.mocked(analyzeAllChunks).mockResolvedValueOnce({
      analyses: new Map([
        [0, { claims: [] }],
        [1, { claims: [] }],
      ]) as unknown as Awaited<ReturnType<typeof analyzeAllChunks>>['analyses'],
      droppedChunks: 3,
      totalChunks: 5,
    });

    const processor = capturedProcessor.current as (job: unknown) => Promise<void>;
    await processor(makeJobWithDiscard(1));

    const setArgs = captureSetArgs(mockDbUpdate);
    const flagsArg = setArgs.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'qualityFlags' in (a as object)
    );
    expect(flagsArg).toBeDefined();
    const flags = flagsArg!.qualityFlags as Array<Record<string, unknown>>;
    const droppedFlag = flags.find((f) => f.code === 'chunks_dropped');
    expect(droppedFlag).toBeDefined();
    expect(droppedFlag).toMatchObject({
      code: 'chunks_dropped',
      severity: 'warning',
      details: expect.objectContaining({ droppedChunks: 3 }),
    });
  });
});
