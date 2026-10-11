import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceSectionParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
  max: (col: string) => ({ max: col }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaceSections: {
    id: 'id',
    workspaceId: 'workspaceId',
    sortOrder: 'sortOrder',
    parentSectionId: 'parentSectionId',
  },
  adminSectionVersions: {
    sectionId: 'sectionId',
    version: 'version',
  },
}));

let latestVersionResult: unknown[] = [];
let insertResult: unknown[] = [];
let newSectionResult: unknown[] = [];

const mockTx = {
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

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(latestVersionResult)),
        })),
      })),
    })),
  })),
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  transaction: vi.fn((fn: (tx: any) => Promise<unknown>) => fn(mockTx)),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/workspaces/1/sections/10/split', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = '1', sectionId = '10') {
  return { params: Promise.resolve({ id, sectionId }) };
}

const defaultSection = {
  id: 10,
  title: 'Overview',
  workspaceId: 1,
  parentSectionId: null,
  template: 'prose',
  sortOrder: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  latestVersionResult = [];
  insertResult = [];
  newSectionResult = [];
  mockResolveResult.current = {
    workspace: { id: 1, title: 'Workspace' },
    section: { ...defaultSection },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/workspaces/[id]/sections/[sectionId]/split', () => {
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
    const response = await POST(makeRequest({ splitAt: 2 }) as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('returns 400 when splitAt is not a positive number', async () => {
    const POST = await getHandler();

    const res1 = await POST(makeRequest({ splitAt: 0 }) as never, makeParams());
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toMatch(/splitAt/);

    const res2 = await POST(makeRequest({ splitAt: -1 }) as never, makeParams());
    expect(res2.status).toBe(400);

    const res3 = await POST(makeRequest({ splitAt: 'abc' }) as never, makeParams());
    expect(res3.status).toBe(400);
  });

  it('returns 400 when splitAt exceeds content length', async () => {
    latestVersionResult = [{ content: 'line1\nline2\nline3', version: 1 }];

    const POST = await getHandler();
    const response = await POST(makeRequest({ splitAt: 3 }) as never, makeParams());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/exceeds/);
  });

  it('splits content at the correct line and creates new section in transaction', async () => {
    latestVersionResult = [{ content: 'line1\nline2\nline3\nline4', version: 2 }];

    const capturedInsertValues: Record<string, unknown>[] = [];
    let insertCallCount = 0;

    // First insert returns the updated version, second returns the new section, third is void
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockTx.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedInsertValues.push(vals);
        insertCallCount++;
        if (insertCallCount === 1) {
          // Insert version for original section (first half)
          return {
            returning: vi.fn(() =>
              Promise.resolve([{ id: 100, sectionId: 10, version: 3, content: 'line1\nline2' }])
            ),
          };
        }
        if (insertCallCount === 2) {
          // Insert new section
          return {
            returning: vi.fn(() =>
              Promise.resolve([
                {
                  id: 20,
                  title: 'Second Part',
                  slug: 'second-part',
                  workspaceId: 1,
                  sortOrder: 2,
                },
              ])
            ),
          };
        }
        // Insert version for new section (second half)
        return {
          returning: vi.fn(() => Promise.resolve([])),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ splitAt: 2, secondTitle: 'Second Part' }) as never,
      makeParams()
    );
    expect(response.status).toBe(201);

    // First insert: version for original with first half
    expect(capturedInsertValues[0]?.content).toBe('line1\nline2');
    expect(capturedInsertValues[0]?.version).toBe(3);
    expect(capturedInsertValues[0]?.changeDescription).toMatch(/first half/i);

    // Second insert: new section
    expect(capturedInsertValues[1]?.title).toBe('Second Part');
    expect(capturedInsertValues[1]?.slug).toBe('second-part');
    expect(capturedInsertValues[1]?.sortOrder).toBe(2);

    // Third insert: version for new section with second half
    expect(capturedInsertValues[2]?.content).toBe('line3\nline4');
    expect(capturedInsertValues[2]?.version).toBe(1);
    expect(capturedInsertValues[2]?.changeDescription).toMatch(/second half/i);
  });

  it('uses "continued" default title when secondTitle not provided', async () => {
    latestVersionResult = [{ content: 'line1\nline2\nline3', version: 1 }];

    const capturedInsertValues: Record<string, unknown>[] = [];
    let insertCallCount = 0;

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockTx.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedInsertValues.push(vals);
        insertCallCount++;
        if (insertCallCount === 1) {
          return {
            returning: vi.fn(() =>
              Promise.resolve([{ id: 100, sectionId: 10, version: 2, content: 'line1' }])
            ),
          };
        }
        if (insertCallCount === 2) {
          return {
            returning: vi.fn(() =>
              Promise.resolve([
                {
                  id: 20,
                  title: 'Overview (continued)',
                  slug: 'overview-continued',
                  workspaceId: 1,
                  sortOrder: 2,
                },
              ])
            ),
          };
        }
        return {
          returning: vi.fn(() => Promise.resolve([])),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(makeRequest({ splitAt: 1 }) as never, makeParams());
    expect(response.status).toBe(201);

    // New section should use "(continued)" suffix
    expect(capturedInsertValues[1]?.title).toBe('Overview (continued)');
    expect(capturedInsertValues[1]?.slug).toBe('overview-continued');
  });
});
