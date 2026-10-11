import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({
  config: { rag: { topK: 5 } },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: { col, val } }),
  isNotNull: (col: unknown) => ({ isNotNull: col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join('?'),
    values,
  }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminDocumentChunks: {
    id: 'chunks.id',
    content: 'chunks.content',
    embedding: 'chunks.embedding',
    documentId: 'chunks.documentId',
    chunkIndex: 'chunks.chunkIndex',
    metadata: 'chunks.metadata',
    curationStatus: 'chunks.curationStatus',
  },
  adminDocuments: {
    id: 'documents.id',
    title: 'documents.title',
    userId: 'documents.userId',
  },
  adminKbChunks: {
    chunkId: 'kb_chunks.chunkId',
    knowledgeBaseId: 'kb_chunks.knowledgeBaseId',
  },
}));

let queryResults: unknown[] = [];

const mockLimit = vi.fn(() => Promise.resolve(queryResults));
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy, limit: mockLimit }));
const mockInnerJoin2 = vi.fn(() => ({ where: mockWhere }));
const mockInnerJoin1 = vi.fn(() => ({ innerJoin: mockInnerJoin2, where: mockWhere }));
const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin1, where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/db', () => ({
  db: { select: () => mockSelect() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  queryResults = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('searchKnowledgeBase', () => {
  async function getModule() {
    return import('./search');
  }

  it('returns search results from knowledge base', async () => {
    queryResults = [
      {
        chunkId: 1,
        content: 'First result content',
        score: 0.92,
        documentId: 10,
        documentTitle: 'Test Doc',
        chunkIndex: 0,
        metadata: null,
      },
      {
        chunkId: 2,
        content: 'Second result content',
        score: 0.85,
        documentId: 10,
        documentTitle: 'Test Doc',
        chunkIndex: 1,
        metadata: { pageRange: '1-2' },
      },
    ];

    const { searchKnowledgeBase } = await getModule();
    const results = await searchKnowledgeBase(1, [0.1, 0.2, 0.3]);

    expect(results).toHaveLength(2);
    expect(results[0]?.score).toBe(0.92);
    expect(results[0]?.documentTitle).toBe('Test Doc');
  });

  it('returns empty array when no matches', async () => {
    queryResults = [];
    const { searchKnowledgeBase } = await getModule();
    const results = await searchKnowledgeBase(1, [0.1, 0.2]);
    expect(results).toEqual([]);
  });

  it('uses provided topK parameter', async () => {
    queryResults = [];
    const { searchKnowledgeBase } = await getModule();
    await searchKnowledgeBase(1, [0.1], 10);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('uses default topK from config', async () => {
    queryResults = [];
    const { searchKnowledgeBase } = await getModule();
    await searchKnowledgeBase(1, [0.1]);
    expect(mockLimit).toHaveBeenCalledWith(5);
  });

  it('builds vector literal from embedding array', async () => {
    queryResults = [];
    const { searchKnowledgeBase } = await getModule();
    await searchKnowledgeBase(1, [0.5, 0.6, 0.7]);
    // The select call should have been made (vector literal built internally)
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
  });
});

describe('searchAllDocuments', () => {
  async function getModule() {
    return import('./search');
  }

  it('returns results above minimum score', async () => {
    queryResults = [
      {
        chunkId: 1,
        content: 'Good match',
        score: 0.8,
        documentId: 10,
        documentTitle: 'Doc A',
        chunkIndex: 0,
        metadata: null,
      },
      {
        chunkId: 2,
        content: 'Weak match',
        score: 0.2,
        documentId: 11,
        documentTitle: 'Doc B',
        chunkIndex: 0,
        metadata: null,
      },
      {
        chunkId: 3,
        content: 'Moderate match',
        score: 0.5,
        documentId: 12,
        documentTitle: 'Doc C',
        chunkIndex: 0,
        metadata: null,
      },
    ];

    const { searchAllDocuments } = await getModule();
    const results = await searchAllDocuments(1, [0.1, 0.2], 5, 0.3);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.score)).toEqual([0.8, 0.5]);
  });

  it('returns empty array when all results below minScore', async () => {
    queryResults = [
      {
        chunkId: 1,
        content: 'Low',
        score: 0.1,
        documentId: 10,
        documentTitle: 'Doc',
        chunkIndex: 0,
        metadata: null,
      },
    ];

    const { searchAllDocuments } = await getModule();
    const results = await searchAllDocuments(1, [0.1], 5, 0.3);
    expect(results).toEqual([]);
  });

  it('uses default topK and minScore', async () => {
    queryResults = [];
    const { searchAllDocuments } = await getModule();
    await searchAllDocuments(1, [0.1]);
    expect(mockLimit).toHaveBeenCalledWith(5);
  });

  it('returns empty array when no embeddings match', async () => {
    queryResults = [];
    const { searchAllDocuments } = await getModule();
    const results = await searchAllDocuments(1, [0.1, 0.2]);
    expect(results).toEqual([]);
  });
});
