import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: string, val: unknown) => ({ col, val }),
  gte: (col: string, val: unknown) => ({ gte: { col, val } }),
  isNull: (col: string) => ({ isNull: col }),
  like: (col: string, pattern: string) => ({ like: { col, pattern } }),
  max: (col: string) => ({ max: col }),
  sql: () => ({}),
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaceSections: {
    id: 'id',
    workspaceId: 'workspaceId',
    sortOrder: 'sortOrder',
    parentSectionId: 'parentSectionId',
    slug: 'slug',
  },
}));

let maxSortResult: unknown[] = [];
let slugResult: { slug: string }[] = [];
let insertResult: unknown[] = [];

const mockDb = {
  // The slug de-duplication query selects `slug`; everything else gets the max-sort rows
  select: vi.fn((fields?: Record<string, unknown>) => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(fields && 'slug' in fields ? slugResult : maxSortResult)),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(insertResult)),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/workspaces/1/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = '1') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  maxSortResult = [{ maxSort: 0 }];
  slugResult = [];
  insertResult = [];
  mockResolveResult.current = {
    workspace: { id: 1, title: 'Workspace' },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/workspaces/[id]/sections', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 404 when resolve fails', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }),
    };
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ title: 'Test', slug: 'test' }) as never,
      makeParams()
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when title is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ slug: 'test' }) as never, makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 400 when slug is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ title: 'Test' }) as never, makeParams());
    expect(response.status).toBe(400);
  });

  it('creates section with auto sort order', async () => {
    maxSortResult = [{ maxSort: 3 }];
    insertResult = [{ id: 10, title: 'New Section', slug: 'new-section', sortOrder: 4 }];

    let capturedValues: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return {
          returning: vi.fn(() => Promise.resolve(insertResult)),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ title: 'New Section', slug: 'new-section', template: 'cards' }) as never,
      makeParams()
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe('New Section');
    expect(capturedValues!.sortOrder).toBe(4);
    expect(capturedValues!.template).toBe('cards');
    expect(capturedValues!.slug).toBe('new-section');
  });

  it('suffixes the slug when it is already taken in the workspace', async () => {
    slugResult = [{ slug: 'new-section' }];
    insertResult = [{ id: 11, title: 'New Section', slug: 'new-section-2' }];

    let capturedValues: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve(insertResult)) };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ title: 'New Section', slug: 'new-section' }) as never,
      makeParams()
    );
    expect(response.status).toBe(201);
    expect(capturedValues!.slug).toBe('new-section-2');
  });
});
