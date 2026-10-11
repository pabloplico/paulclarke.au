import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = vi.hoisted(() => ({
  current: { id: 1, email: 'test@example.com', role: 'admin' },
}));
const mockSearchResults = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() => Promise.resolve(mockUser.current)),
}));

vi.mock('@/lib/rag/embeddings', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
}));

vi.mock('@/lib/rag/search', () => ({
  searchAllDocuments: vi.fn(() => Promise.resolve(mockSearchResults.current)),
}));

vi.mock('@/lib/api/safe-json', () => ({
  safeParseJson: vi.fn(async (req: Request) => {
    const data = await req.json();
    return { data, error: null };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchResults.current = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/find-source', () => {
  async function callRoute(body: object) {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/find-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(request);
  }

  it('returns 400 when text is missing', async () => {
    const res = await callRoute({});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('text is required');
  });

  it('returns 400 when text is empty', async () => {
    const res = await callRoute({ text: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns empty sources when no search results', async () => {
    mockSearchResults.current = [];
    const res = await callRoute({ text: 'some query' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hasResults).toBe(false);
    expect(data.sources).toEqual([]);
  });

  it('groups chunks by document and sorts by best score', async () => {
    mockSearchResults.current = [
      {
        chunkId: 1,
        content: 'chunk A',
        score: 0.7,
        chunkIndex: 0,
        documentId: 10,
        documentTitle: 'Doc Alpha',
        metadata: null,
      },
      {
        chunkId: 2,
        content: 'chunk B',
        score: 0.9,
        chunkIndex: 1,
        documentId: 10,
        documentTitle: 'Doc Alpha',
        metadata: null,
      },
      {
        chunkId: 3,
        content: 'chunk C',
        score: 0.8,
        chunkIndex: 0,
        documentId: 20,
        documentTitle: 'Doc Beta',
        metadata: { pageRange: '3-4' },
      },
    ];

    const res = await callRoute({ text: 'test query' });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.hasResults).toBe(true);
    expect(data.sources).toHaveLength(2);

    // Doc Alpha has best score 0.9, should be first
    expect(data.sources[0].documentId).toBe(10);
    expect(data.sources[0].bestScore).toBe(0.9);
    expect(data.sources[0].chunks).toHaveLength(2);

    // Doc Beta has best score 0.8, should be second
    expect(data.sources[1].documentId).toBe(20);
    expect(data.sources[1].bestScore).toBe(0.8);
    expect(data.sources[1].chunks[0].pageRange).toBe('3-4');
  });

  it('truncates content to 300 chars', async () => {
    const longContent = 'x'.repeat(500);
    mockSearchResults.current = [
      {
        chunkId: 1,
        content: longContent,
        score: 0.9,
        chunkIndex: 0,
        documentId: 10,
        documentTitle: 'Doc',
        metadata: null,
      },
    ];

    const res = await callRoute({ text: 'query' });
    const data = await res.json();
    expect(data.sources[0].chunks[0].content).toHaveLength(300);
  });

  it('truncates query in response to 100 chars', async () => {
    const longQuery = 'q'.repeat(200);
    const res = await callRoute({ text: longQuery });
    const data = await res.json();
    expect(data.query).toHaveLength(100);
  });

  it('extracts metadata fields (pageRange, sectionHeading)', async () => {
    mockSearchResults.current = [
      {
        chunkId: 1,
        content: 'test',
        score: 0.9,
        chunkIndex: 0,
        documentId: 10,
        documentTitle: 'Doc',
        metadata: { pageRange: '1-2', sectionHeading: 'Introduction' },
      },
    ];

    const res = await callRoute({ text: 'query' });
    const data = await res.json();
    expect(data.sources[0].chunks[0].pageRange).toBe('1-2');
    expect(data.sources[0].chunks[0].sectionHeading).toBe('Introduction');
  });

  it('returns 500 when search throws', async () => {
    const { searchAllDocuments } = await import('@/lib/rag/search');
    vi.mocked(searchAllDocuments).mockRejectedValueOnce(new Error('DB error'));

    const res = await callRoute({ text: 'query' });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Search failed');
  });
});
