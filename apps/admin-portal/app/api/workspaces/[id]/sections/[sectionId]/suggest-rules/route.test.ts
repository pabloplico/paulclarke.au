import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceSectionParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({
  generateObject: (opts: Record<string, unknown>) => mockGenerateObject(opts),
}));

const mockGetModel = vi.fn((_cfg: unknown) => ({ provider: 'mock', modelId: 'test-model' }));
vi.mock('@/lib/ai/models', () => ({
  getModel: (cfg: unknown) => mockGetModel(cfg),
}));

const mockLoadConfig = vi.fn(() => Promise.resolve({ ai: { provider: 'openai' } }));
vi.mock('@/lib/config.server', () => ({
  loadConfig: () => mockLoadConfig(),
}));

let versionsResult: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(versionsResult)),
        })),
      })),
    })),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaceSections: { id: 'id' },
  adminSectionVersions: { sectionId: 'sectionId', version: 'version' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost:3001/api/workspaces/1/sections/1/suggest-rules', {
    method: 'POST',
  });
}

function makeParams(id = '1', sectionId = '1') {
  return { params: Promise.resolve({ id, sectionId }) };
}

function setResolvedSection(section: Record<string, unknown>) {
  mockResolveResult.current = {
    workspace: { id: 1, title: 'Workspace', description: '' },
    section,
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  versionsResult = [];
  mockLoadConfig.mockResolvedValue({ ai: { provider: 'openai' } });
  setResolvedSection({
    id: 1,
    title: 'Overview',
    template: 'prose',
    description: '',
    completenessRules: [],
  });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/workspaces/[id]/sections/[sectionId]/suggest-rules', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 404 when resolve fails', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Section not found' }, { status: 404 }),
    };
    const POST = await getHandler();
    const response = await POST(makeRequest() as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('calls generateObject with AI model and returns suggestions', async () => {
    setResolvedSection({
      id: 1,
      title: 'Overview',
      template: 'prose',
      description: 'Company overview',
      completenessRules: [],
    });
    mockResolveResult.current = {
      ...mockResolveResult.current,
      workspace: { id: 1, title: 'Acme Corp', description: 'Client workspace' },
    };
    versionsResult = [{ content: 'Some content here that is long enough', structuredData: null }];

    const mockRules = [
      {
        type: 'min_length',
        description: 'Content should be at least 200 characters',
        params: { minLength: 200 },
      },
    ];
    mockGenerateObject.mockResolvedValue({ object: { rules: mockRules } });

    const POST = await getHandler();
    const response = await POST(makeRequest() as never, makeParams());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.suggestions).toEqual(mockRules);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGetModel).toHaveBeenCalled();
  });

  it('returns 500 when AI generation fails', async () => {
    versionsResult = [{ content: 'Content', structuredData: null }];
    mockGenerateObject.mockRejectedValue(new Error('AI API error'));

    const POST = await getHandler();
    const response = await POST(makeRequest() as never, makeParams());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to generate suggestions');
  });

  it('handles section with no versions (empty content)', async () => {
    versionsResult = []; // No versions

    mockGenerateObject.mockResolvedValue({ object: { rules: [] } });

    const POST = await getHandler();
    const response = await POST(makeRequest() as never, makeParams());
    expect(response.status).toBe(200);

    const callArgs = mockGenerateObject.mock.calls[0]?.[0];
    expect(callArgs.prompt).toContain('(empty)');
  });

  it('summarizes structured data items in AI prompt', async () => {
    setResolvedSection({
      id: 1,
      title: 'Checklist',
      template: 'checklist',
      description: '',
      completenessRules: [],
    });
    versionsResult = [
      {
        content: '',
        structuredData: { items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
      },
    ];

    mockGenerateObject.mockResolvedValue({ object: { rules: [] } });

    const POST = await getHandler();
    const response = await POST(makeRequest() as never, makeParams());
    expect(response.status).toBe(200);

    const callArgs = mockGenerateObject.mock.calls[0]?.[0];
    expect(callArgs.prompt).toContain('3 items');
  });

  it('passes existing rules to AI prompt to avoid duplicates', async () => {
    const existingRules = [
      { type: 'min_length', description: 'Existing rule', params: { minLength: 100 } },
    ];
    setResolvedSection({
      id: 1,
      title: 'Section',
      template: 'prose',
      description: '',
      completenessRules: existingRules,
    });
    versionsResult = [{ content: 'Some content', structuredData: null }];

    mockGenerateObject.mockResolvedValue({ object: { rules: [] } });

    const POST = await getHandler();
    const response = await POST(makeRequest() as never, makeParams());
    expect(response.status).toBe(200);

    const callArgs = mockGenerateObject.mock.calls[0]?.[0];
    expect(callArgs.prompt).toContain('Existing rule');
    expect(callArgs.prompt).not.toContain('None — this section has no rules yet');
  });

  it('loads config via loadConfig', async () => {
    versionsResult = [{ content: 'Content', structuredData: null }];
    mockGenerateObject.mockResolvedValue({ object: { rules: [] } });

    const POST = await getHandler();
    await POST(makeRequest() as never, makeParams());

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockGetModel).toHaveBeenCalled();
  });
});
