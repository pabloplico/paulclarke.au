import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() => Promise.resolve({ id: 1, email: 'u@example.com', role: 'admin' })),
}));

// Schema mock — use unique objects so identity matching works
const mockSchema = {
  adminKnowledgeBases: { id: 'id', name: 'name', description: 'description', userId: 'userId' },
  adminConversations: {
    id: 'id',
    title: 'title',
    knowledgeBaseId: 'knowledgeBaseId',
    userId: 'userId',
  },
  adminMessages: {
    id: 'id',
    conversationId: 'conversationId',
    role: 'role',
    content: 'content',
    sources: 'sources',
  },
};

vi.mock('@/lib/db/schema', () => ({
  adminKnowledgeBases: mockSchema.adminKnowledgeBases,
  adminConversations: mockSchema.adminConversations,
  adminMessages: mockSchema.adminMessages,
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (col: string, val: unknown) => ({ col, val }),
}));

// ── DB mock state ─────────────────────────────────────────────────────────

// Queue of results: each call to .select() pops from the front
let selectQueue: unknown[][] = [];
let insertedValues: Record<string, unknown>[] = [];
let conversationInsertReturning: unknown[] = [{ id: 77 }];

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const result = selectQueue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.then = (fn: (v: unknown[]) => void) => Promise.resolve(result as unknown[]).then(fn);
      // Make the chain itself thenable / awaitable as an array
      Object.defineProperty(chain, Symbol.iterator, {
        value: (result as unknown[]).values?.bind(result as unknown[]),
        writable: true,
      });
      return chain;
    }),
    insert: vi.fn((table: unknown) => {
      let tableName = '';
      if (table === mockSchema.adminConversations) tableName = 'adminConversations';
      else if (table === mockSchema.adminMessages) tableName = 'adminMessages';

      return {
        values: vi.fn((vals: Record<string, unknown>) => {
          insertedValues.push({ _table: tableName, ...vals });
          return {
            returning: vi.fn(() => Promise.resolve(conversationInsertReturning)),
          };
        }),
      };
    }),
  },
}));

// ── AI / RAG mocks ────────────────────────────────────────────────────────

const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
  generateText: (opts: Record<string, unknown>) => mockGenerateText(opts),
}));

const mockGetModel = vi.fn((_cfg?: unknown) => 'mock-model');
vi.mock('@/lib/ai/models', () => ({
  getModel: (cfg: unknown) => mockGetModel(cfg),
}));

const mockLogAIUsage = vi.fn();
vi.mock('@/lib/ai/usage-logger', () => ({
  logAIUsage: (opts: Record<string, unknown>) => mockLogAIUsage(opts),
}));

const mockGenerateEmbedding = vi.fn((_text?: unknown) => Promise.resolve([0.1, 0.2]));
vi.mock('@/lib/rag/embeddings', () => ({
  generateEmbedding: (text: unknown) => mockGenerateEmbedding(text),
}));

const mockSearchKnowledgeBase = vi.fn((..._args: unknown[]) => Promise.resolve([] as any[]));
vi.mock('@/lib/rag/search', () => ({
  searchKnowledgeBase: (...args: unknown[]) => mockSearchKnowledgeBase(...args),
}));

const mockLoadConfig = vi.fn(() =>
  Promise.resolve({ ai: { model: 'gpt-4o', provider: 'openai' } })
);
vi.mock('@/lib/config.server', () => ({
  loadConfig: () => mockLoadConfig(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockUser = { id: 1, email: 'u@example.com', role: 'admin' };

const mockKb = { id: 1, name: 'My KB', description: 'A KB', userId: 1 };

const mockSearchResult = {
  chunkId: 5,
  documentId: 2,
  documentTitle: 'Doc A',
  chunkIndex: 0,
  score: 0.92,
  content: 'This is the chunk content for retrieval.',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(body: object) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getHandler() {
  const mod = await import('./route');
  return mod.POST;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  selectQueue = [];
  insertedValues = [];
  conversationInsertReturning = [{ id: 77 }];

  // Default: generateText returns a happy result
  mockGenerateText.mockResolvedValue({
    text: 'Here is my answer [Source 1].',
    usage: { inputTokens: 80, outputTokens: 30 },
  });

  // Default: embedding succeeds
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);

  // Default: search returns one result
  mockSearchKnowledgeBase.mockResolvedValue([mockSearchResult]);
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/chat', () => {
  // TC-007-01
  it('returns 400 when message is empty/whitespace', async () => {
    const POST = await getHandler();
    const res = await POST(makeRequest({ message: '   ', knowledgeBaseId: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Message is required');
  });

  // TC-007-02
  it('returns 400 when knowledgeBaseId is missing', async () => {
    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hello' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('knowledgeBaseId is required');
  });

  // TC-007-03
  it('returns 404 when knowledge base is not found', async () => {
    // KB select returns empty
    selectQueue = [[]];

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hello', knowledgeBaseId: 999 }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Knowledge base not found');
  });

  // TC-007-04
  it('returns 500 when embedding generation fails', async () => {
    selectQueue = [[mockKb]];
    mockGenerateEmbedding.mockRejectedValue(new Error('quota exceeded'));

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hello', knowledgeBaseId: 1 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to generate embedding');
  });

  // TC-007-05
  it('returns 500 when RAG search fails', async () => {
    selectQueue = [[mockKb]];
    mockSearchKnowledgeBase.mockRejectedValue(new Error('pgvector unavailable'));

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hello', knowledgeBaseId: 1 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Search failed');
  });

  // TC-007-06
  it('returns 500 when LLM call fails', async () => {
    selectQueue = [[mockKb]];
    mockGenerateText.mockRejectedValue(new Error('LLM timeout'));

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hello', knowledgeBaseId: 1 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('LLM call failed');
  });

  // TC-007-07
  it('new conversation: full happy path', async () => {
    // select #1: KB lookup → found
    selectQueue = [[mockKb]];
    conversationInsertReturning = [{ id: 77 }];

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'What is AI?', knowledgeBaseId: 1 }));

    expect(res.status).toBe(200);
    const body = await res.json();

    // Response shape
    expect(body.message).toBe('Here is my answer [Source 1].');
    expect(body.conversationId).toBe(77);
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources).toHaveLength(1);

    // Source shape including preview
    const src = body.sources[0];
    expect(src.chunkId).toBe(5);
    expect(src.documentId).toBe(2);
    expect(src.documentTitle).toBe('Doc A');
    expect(src.chunkIndex).toBe(0);
    expect(src.score).toBe(0.92);
    expect(src.preview).toBe('This is the chunk content for retrieval.');
    expect(src.preview.length).toBeLessThanOrEqual(200);

    // adminConversations insert
    const convInsert = insertedValues.find((v) => v._table === 'adminConversations');
    expect(convInsert).toBeDefined();
    expect(convInsert?.title).toBe('What is AI?');
    expect(convInsert?.knowledgeBaseId).toBe(1);
    expect(convInsert?.userId).toBe(1);

    // adminMessages inserts: user + assistant
    const msgInserts = insertedValues.filter((v) => v._table === 'adminMessages');
    expect(msgInserts).toHaveLength(2);
    expect(msgInserts[0]?.role).toBe('user');
    expect(msgInserts[0]?.content).toBe('What is AI?');
    expect(msgInserts[1]?.role).toBe('assistant');
    expect(msgInserts[1]?.content).toBe('Here is my answer [Source 1].');

    // logAIUsage called with stage and tokens
    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'kb-chat',
        inputTokens: 80,
        outputTokens: 30,
      })
    );
  });

  // TC-007-08
  it('context string format from search results', async () => {
    selectQueue = [[mockKb]];

    mockSearchKnowledgeBase.mockResolvedValue([
      {
        chunkId: 1,
        documentId: 10,
        documentTitle: 'Doc A',
        chunkIndex: 0,
        score: 0.9,
        content: 'First chunk.',
      },
      {
        chunkId: 2,
        documentId: 11,
        documentTitle: 'Doc B',
        chunkIndex: 3,
        score: 0.85,
        content: 'Second chunk.',
      },
    ]);

    const POST = await getHandler();
    await POST(makeRequest({ message: 'Query', knowledgeBaseId: 1 }));

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { system: string };
    expect(callArgs.system).toContain('[Source 1: "Doc A", Chunk #0]');
    expect(callArgs.system).toContain('[Source 2: "Doc B", Chunk #3]');
    expect(callArgs.system).toContain('---');
  });

  // TC-007-09
  it('system prompt includes KB name and description', async () => {
    const kb = { id: 1, name: 'Sales Playbook', description: 'Internal sales guide', userId: 1 };
    selectQueue = [[kb]];

    const POST = await getHandler();
    await POST(makeRequest({ message: 'hi', knowledgeBaseId: 1 }));

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { system: string };
    expect(callArgs.system).toContain('Sales Playbook');
    expect(callArgs.system).toContain('Internal sales guide');
  });

  // TC-007-10
  it('system prompt with no KB description omits description clause', async () => {
    const kb = { id: 1, name: 'Empty KB', description: null, userId: 1 };
    selectQueue = [[kb]];

    const POST = await getHandler();
    await POST(makeRequest({ message: 'hi', knowledgeBaseId: 1 }));

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { system: string };
    expect(callArgs.system).toContain('Empty KB');
    expect(callArgs.system).not.toContain('Context:');
  });

  // TC-007-11
  it('resuming conversation loads history and passes to LLM', async () => {
    // select #1: KB lookup
    // select #2: conversation ownership check → found
    // select #3: messages for conversation
    selectQueue = [
      [mockKb],
      [{ id: 55 }],
      [
        { role: 'user', content: 'previous question', conversationId: 55 },
        { role: 'assistant', content: 'previous answer', conversationId: 55 },
      ],
    ];
    mockGenerateText.mockResolvedValue({
      text: 'new answer',
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({ message: 'follow-up', knowledgeBaseId: 1, conversationId: 55 })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversationId).toBe(55);

    // generateText should have received history + new message
    const callArgs = mockGenerateText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArgs.messages).toHaveLength(3);
    expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'previous question' });
    expect(callArgs.messages[1]).toEqual({ role: 'assistant', content: 'previous answer' });
    expect(callArgs.messages[2]).toEqual({ role: 'user', content: 'follow-up' });

    // adminConversations insert should NOT have been called
    const convInsert = insertedValues.find((v) => v._table === 'adminConversations');
    expect(convInsert).toBeUndefined();

    // adminMessages inserts: user + assistant
    const msgInserts = insertedValues.filter((v) => v._table === 'adminMessages');
    expect(msgInserts).toHaveLength(2);
  });

  // TC-007-12
  it('returns 404 when conversation is not found or not owned', async () => {
    // select #1: KB → found
    // select #2: conversation ownership → not found
    selectQueue = [[mockKb], []];

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hi', knowledgeBaseId: 1, conversationId: 55 }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Conversation not found');
  });

  // TC-007-13
  it('preview is truncated to 200 characters', async () => {
    const longContent = 'x'.repeat(300);
    selectQueue = [[mockKb]];
    mockSearchKnowledgeBase.mockResolvedValue([
      {
        chunkId: 1,
        documentId: 1,
        documentTitle: 'Big Doc',
        chunkIndex: 0,
        score: 0.9,
        content: longContent,
      },
    ]);

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'hi', knowledgeBaseId: 1 }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sources[0].preview.length).toBe(200);
  });

  // TC-007-14
  it('empty search results produces "No relevant sources" system prompt', async () => {
    selectQueue = [[mockKb]];
    mockSearchKnowledgeBase.mockResolvedValue([]);

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: 'random query', knowledgeBaseId: 1 }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources).toHaveLength(0);

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { system: string };
    expect(callArgs.system).toContain('No relevant sources found for this query.');
  });

  // TC-007-15
  it('conversation title is capped at 100 characters', async () => {
    selectQueue = [[mockKb]];
    const longMessage = 'x'.repeat(150);

    const POST = await getHandler();
    const res = await POST(makeRequest({ message: longMessage, knowledgeBaseId: 1 }));

    expect(res.status).toBe(200);
    const convInsert = insertedValues.find((v) => v._table === 'adminConversations');
    expect(convInsert).toBeDefined();
    expect(typeof convInsert?.title).toBe('string');
    expect((convInsert?.title as string).length).toBe(100);
  });
});
