import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

let inboxResult: unknown[] = [];
let updatedSets: Record<string, unknown>[] = [];

const mockSchema = {
  adminInboxItems: { id: 'id', status: 'status', routingResults: 'routingResults' },
};

function chainable(resolve: () => Promise<unknown[]>) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => resolve());
  chain.set = vi.fn((data: Record<string, unknown>) => {
    updatedSets.push(data);
    return chain;
  });
  chain.then = (fn: (v: unknown[]) => void) => resolve().then(fn);
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const chain = chainable(() => Promise.resolve(inboxResult));
      chain.from = vi.fn((table: unknown) => {
        if (table === mockSchema.adminInboxItems) {
          // recognized
        }
        return chain;
      });
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn((data: Record<string, unknown>) => {
        updatedSets.push(data);
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    })),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  adminInboxItems: mockSchema.adminInboxItems,
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (col: string, val: unknown) => ({ col, val }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

type NextRequest = import('next/server').NextRequest;

function makeRequest(body: Record<string, unknown> = { suggestionIndex: 0 }): NextRequest {
  return new Request('http://localhost:3001/api/inbox/1/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeParams(id = '1') {
  return { params: Promise.resolve({ id }) };
}

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 10,
    workspaceTitle: 'Services',
    sectionId: 20,
    sectionTitle: 'Overview',
    confidence: 0.9,
    action: 'replace',
    suggestedContent: 'Some content',
    reasoning: 'Matches topic',
    ...overrides,
  };
}

function makeInboxItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'file',
    title: 'test.pdf',
    content: null,
    documentId: 100,
    status: 'routed',
    routingResults: [makeSuggestion()],
    approvedResults: null,
    processingError: null,
    createdAt: new Date(),
    processedAt: new Date(),
    userId: 1,
    ...overrides,
  };
}

async function getHandler() {
  const mod = await import('./route');
  return mod.POST;
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  inboxResult = [];
  updatedSets = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/inbox/[id]/skip', () => {
  it('returns 404 when inbox item not found', async () => {
    inboxResult = [];
    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 400 when item is not routed', async () => {
    inboxResult = [makeInboxItem({ status: 'pending' })];
    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid suggestion index', async () => {
    inboxResult = [makeInboxItem()];
    const POST = await getHandler();
    const res = await POST(makeRequest({ suggestionIndex: 5 }), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative suggestion index', async () => {
    inboxResult = [makeInboxItem()];
    const POST = await getHandler();
    const res = await POST(makeRequest({ suggestionIndex: -1 }), makeParams());
    expect(res.status).toBe(400);
  });

  it('removes suggestion and keeps status routed when others remain', async () => {
    const suggestions = [
      makeSuggestion({ sectionTitle: 'Overview' }),
      makeSuggestion({ sectionId: 30, sectionTitle: 'Details' }),
    ];
    inboxResult = [makeInboxItem({ routingResults: suggestions })];

    const POST = await getHandler();
    const res = await POST(makeRequest({ suggestionIndex: 0 }), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.remaining).toBe(1);

    const update = updatedSets[0]!;
    expect(update.status).toBe('routed');
    expect((update.routingResults as unknown[]).length).toBe(1);
  });

  it('sets status to dismissed when last suggestion skipped and none approved', async () => {
    inboxResult = [makeInboxItem({ routingResults: [makeSuggestion()], approvedResults: null })];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const update = updatedSets[0]!;
    expect(update.status).toBe('dismissed');
    expect(update.routingResults).toBeNull();
  });

  it('sets status to approved when last suggestion skipped but some were approved', async () => {
    const existingApproved = [
      {
        workspaceId: 5,
        workspaceTitle: 'Old',
        workspaceSlug: 'old',
        sectionId: 15,
        sectionTitle: 'Prev',
        versionId: 99,
        approvedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    inboxResult = [
      makeInboxItem({
        routingResults: [makeSuggestion()],
        approvedResults: existingApproved,
      }),
    ];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const update = updatedSets[0]!;
    expect(update.status).toBe('approved');
    expect(update.routingResults).toBeNull();
  });
});
