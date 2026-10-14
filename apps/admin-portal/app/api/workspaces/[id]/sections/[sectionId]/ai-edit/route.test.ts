import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

// The AI allowance (rate limit, budget) has its own tests
vi.mock('@/lib/ai/allowance', () => ({
  requireAiAllowance: async () => {},
  aiBudgetResponse: () => null,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceSectionParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

const mockGenerateText = vi.fn();
const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({
  generateText: (opts: Record<string, unknown>) => mockGenerateText(opts),
  generateObject: (opts: Record<string, unknown>) => mockGenerateObject(opts),
}));

const mockGetModel = vi.fn((_cfg?: unknown) => 'mock-model');
vi.mock('@/lib/ai/models', () => ({
  getModel: (cfg: unknown) => mockGetModel(cfg),
}));

const mockCheckFidelity = vi.fn();
const mockRecordProvenance = vi.fn();
vi.mock('@/lib/ai/semantic-fidelity', () => ({
  checkFidelity: (a: unknown, b: unknown) => mockCheckFidelity(a, b),
  recordProvenance: (a: unknown, b: unknown, c: unknown) => mockRecordProvenance(a, b, c),
}));

const mockEstimateTokens = vi.fn((_text?: unknown) => 100);
const mockEnforceBudget = vi.fn((text: string, _budget?: unknown) => ({
  text,
  truncated: false,
  originalTokens: 100,
  finalTokens: 100,
}));
vi.mock('@/lib/ai/tokens', () => ({
  estimateTokens: (text: unknown) => mockEstimateTokens(text),
  enforceBudget: (text: unknown, budget: unknown) => mockEnforceBudget(text as string, budget),
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockSection = {
  id: 10,
  workspaceId: 1,
  title: 'Test Section',
  description: 'A test section',
  template: 'prose',
};
const mockWorkspace = { id: 1, userId: 1, name: 'Test Workspace' };
const mockUser = { id: 1, email: 'test@example.com', role: 'admin' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/workspaces/1/sections/10/ai-edit', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeParams(id = '1', sectionId = '10') {
  return { params: Promise.resolve({ id, sectionId }) };
}

function setResolvedSection(section = mockSection) {
  mockResolveResult.current = {
    workspace: mockWorkspace,
    section,
    user: mockUser,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  setResolvedSection();

  // Default: generateText returns a happy result
  mockGenerateText.mockResolvedValue({
    text: 'modified content',
    usage: { inputTokens: 100, outputTokens: 50 },
  });

  // Default: fidelity passes
  mockCheckFidelity.mockResolvedValue({
    similarity: 0.9,
    status: 'passed',
    sourceEmbedding: [0.1],
    outputEmbedding: [0.2],
  });

  // Default: provenance returns an id
  mockRecordProvenance.mockResolvedValue(42);

  // Default: token estimates are small (no truncation needed)
  mockEstimateTokens.mockReturnValue(100);
  mockEnforceBudget.mockImplementation((text: string) => ({
    text,
    truncated: false,
    originalTokens: 100,
    finalTokens: 100,
  }));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/workspaces/[id]/sections/[sectionId]/ai-edit', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  // TC-006-01
  it('returns 400 when action is missing', async () => {
    const POST = await getHandler();
    const res = await POST(makeRequest({ selectedText: 'hello' }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('action is required');
  });

  // TC-006-02
  it('returns 400 for unknown action with no customPrompt', async () => {
    const POST = await getHandler();
    const res = await POST(
      makeRequest({ action: 'zap', selectedText: 'hello', fullContent: 'hello world' }),
      makeParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid action');
  });

  // TC-006-03
  it('propagates auth/param resolution failure', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }),
    };
    const POST = await getHandler();
    const res = await POST(makeRequest({ action: 'rewrite' }), makeParams());
    expect(res.status).toBe(404);
  });

  // TC-006-04
  it('analyse action returns topics array (sliced to 8)', async () => {
    // Provide 10 topics; expect at most 8 returned
    mockGenerateObject.mockResolvedValue({
      object: {
        topics: [
          'AI ethics',
          'data privacy',
          'compliance',
          'governance',
          'transparency',
          'accountability',
          'bias',
          'fairness',
          'explainability',
          'robustness',
        ],
      },
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({ action: 'analyse', selectedText: 'some text about AI policy' }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('analyse');
    expect(Array.isArray(body.topics)).toBe(true);
    expect(body.topics.length).toBeLessThanOrEqual(8);
    for (const t of body.topics as unknown[]) {
      expect(typeof t).toBe('string');
    }
  });

  // TC-006-05
  it('returns 500 when analyse generateObject fails', async () => {
    mockGenerateObject.mockRejectedValue(new Error('AI unavailable'));

    const POST = await getHandler();
    const res = await POST(makeRequest({ action: 'analyse', selectedText: 'text' }), makeParams());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('AI analyse failed');
  });

  // TC-006-06
  it('rewrite action on partial selection returns modifiedContent with provenance', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'rewritten text',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    mockCheckFidelity.mockResolvedValue({
      similarity: 0.85,
      status: 'passed',
      sourceEmbedding: [0.1],
      outputEmbedding: [0.2],
    });
    mockRecordProvenance.mockResolvedValue(42);

    const POST = await getHandler();
    const res = await POST(
      makeRequest({
        action: 'rewrite',
        selectedText: 'original phrase',
        fullContent: 'Some content with original phrase here.',
      }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modifiedContent).toBe('rewritten text');
    expect(body.action).toBe('rewrite');
    expect(body.selectedText).toBe('original phrase');
    expect(body.provenanceId).toBe(42);
    expect(body.fidelityWarning).toBeUndefined();

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ai-edit',
        model: expect.any(String),
        inputTokens: 100,
        outputTokens: 50,
      })
    );
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  // TC-006-07
  it('fullSection: true uses full-section system prompt variant', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'simplified',
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({ action: 'simplify', fullContent: 'Long content here.', fullSection: true }),
      makeParams()
    );

    expect(res.status).toBe(200);

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { system: string };
    expect(callArgs.system).toContain('Apply the action to the ENTIRE section content');
    expect(callArgs.system).not.toContain('ONLY modify the selected text portion');
  });

  // TC-006-08
  it('isGenerateFromScratch path skips fidelity check', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'generated content',
      usage: { inputTokens: 30, outputTokens: 80 },
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({ action: 'custom', customPrompt: 'Generate a policy outline.' }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modifiedContent).toBe('generated content');

    // checkFidelity must NOT be called for generate-from-scratch
    expect(mockCheckFidelity).not.toHaveBeenCalled();

    // System prompt should reference empty section generation
    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { system: string };
    expect(callArgs.system).toContain('generate initial content for an empty section');
  });

  // TC-006-09
  it('research action fetches RAG context and includes it in the user prompt', async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockSearchKnowledgeBase.mockResolvedValue([
      {
        documentTitle: 'EU AI Act',
        chunkIndex: 2,
        content: 'Article 6 requirements',
        chunkId: 1,
        documentId: 3,
        score: 0.9,
      },
    ]);
    mockGenerateText.mockResolvedValue({
      text: 'enriched text',
      usage: { inputTokens: 200, outputTokens: 60 },
    });

    const POST = await getHandler();
    await POST(
      makeRequest({
        action: 'research',
        selectedText: 'AI regulation',
        fullContent: 'Context.',
        knowledgeBaseId: 5,
      }),
      makeParams()
    );

    expect(mockGenerateEmbedding).toHaveBeenCalledWith('AI regulation');
    expect(mockSearchKnowledgeBase).toHaveBeenCalledWith(5, [0.1, 0.2], 5);

    // The research context is embedded in the system prompt
    const callArgs = mockGenerateText.mock.calls[0]?.[0] as {
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArgs.system).toContain('[Source 1: "EU AI Act", Chunk #2]');
  });

  // TC-006-10
  it('research action continues without RAG context when embedding throws', async () => {
    mockGenerateEmbedding.mockRejectedValue(new Error('embedding unavailable'));
    mockGenerateText.mockResolvedValue({
      text: 'result',
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({
        action: 'research',
        selectedText: 'something',
        fullContent: 'text',
        knowledgeBaseId: 5,
      }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modifiedContent).toBe('result');
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  // TC-006-11
  it('fidelity rejection returns 422', async () => {
    mockCheckFidelity.mockResolvedValue({
      similarity: 0.2,
      status: 'rejected',
      sourceEmbedding: [],
      outputEmbedding: [],
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({
        action: 'rewrite',
        selectedText: 'original',
        fullContent: 'text with original',
      }),
      makeParams()
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('semantic_fidelity_rejected');
    expect(body.similarity).toBe(0.2);
    expect(body.message).toContain('similarity');
  });

  // TC-006-12
  it('fidelity flagged includes fidelityWarning in 200 response', async () => {
    mockCheckFidelity.mockResolvedValue({
      similarity: 0.65,
      status: 'flagged',
      sourceEmbedding: [0.1],
      outputEmbedding: [0.2],
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({
        action: 'rewrite',
        selectedText: 'original',
        fullContent: 'text with original',
      }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modifiedContent).toBeDefined();
    expect(body.fidelityWarning).toMatchObject({
      similarity: 0.65,
      threshold: 0.78,
      message: expect.stringContaining('similarity'),
    });
  });

  // TC-006-13
  it('fidelity check throwing is swallowed and 200 is returned', async () => {
    mockCheckFidelity.mockRejectedValue(new Error('embedding service down'));

    const POST = await getHandler();
    const res = await POST(
      makeRequest({
        action: 'rewrite',
        selectedText: 'text',
        fullContent: 'full text here',
      }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modifiedContent).toBeDefined();
    expect(body.fidelityWarning).toBeUndefined();
  });

  // TC-006-14
  it('returns 500 when generateText fails', async () => {
    mockGenerateText.mockRejectedValue(new Error('LLM timeout'));

    const POST = await getHandler();
    const res = await POST(
      makeRequest({ action: 'expand', fullContent: 'some content', fullSection: true }),
      makeParams()
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('AI edit failed');
  });

  // TC-006-15
  it('token budget exceeded triggers content truncation', async () => {
    // First call (total system+user) exceeds 12000; subsequent calls return smaller values
    mockEstimateTokens
      .mockReturnValueOnce(15000) // total exceeds limit
      .mockReturnValue(2000); // system tokens alone

    mockEnforceBudget.mockReturnValue({
      text: 'truncated content',
      truncated: true,
      originalTokens: 15000,
      finalTokens: 5000,
    });

    mockGenerateText.mockResolvedValue({
      text: 'result after truncation',
      usage: { inputTokens: 200, outputTokens: 50 },
    });

    const POST = await getHandler();
    const res = await POST(
      makeRequest({
        action: 'simplify',
        fullContent: 'x'.repeat(50000),
        fullSection: true,
      }),
      makeParams()
    );

    // Pipeline should complete successfully
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockLogAIUsage).toHaveBeenCalledWith(expect.objectContaining({ truncated: true }));
    // Response can be 200 (passed fidelity) or 422 depending on mock; what matters is generateText ran
    expect([200, 422].includes(res.status)).toBe(true);
  });
});
