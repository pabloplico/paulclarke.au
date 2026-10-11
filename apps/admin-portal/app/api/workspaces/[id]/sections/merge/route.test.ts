import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
  inArray: (col: string, vals: unknown[]) => ({ col, vals }),
}));

// biome-ignore lint/suspicious/noExplicitAny: test mock
const mockGetLatestVersions = vi.fn<any>(() => Promise.resolve(new Map()));
vi.mock('@/lib/workspaces/latest-versions', () => ({
  getLatestVersions: mockGetLatestVersions,
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
    content: 'content',
  },
}));

let selectSectionsResult: unknown[] = [];
let versionResults: unknown[][] = [];
let versionResultIndex = 0;

const mockTx = {
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([])),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  })),
};

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => {
          // For section fetches (with orderBy at the end), return sections
          // For version fetches (with orderBy -> limit), handled by limit
          return {
            limit: vi.fn(() => {
              const result = versionResults[versionResultIndex] ?? [];
              versionResultIndex++;
              return Promise.resolve(result);
            }),
          };
        }),
      })),
    })),
  })),
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  transaction: vi.fn((fn: (tx: any) => Promise<unknown>) => fn(mockTx)),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/workspaces/1/sections/merge', {
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
  selectSectionsResult = [];
  versionResults = [];
  versionResultIndex = 0;
  mockResolveResult.current = {
    workspace: { id: 1, title: 'Workspace' },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/workspaces/[id]/sections/merge', () => {
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
      makeRequest({ sectionIds: [1, 2], title: 'Merged' }) as never,
      makeParams()
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when fewer than 2 section IDs provided', async () => {
    const POST = await getHandler();

    const res1 = await POST(
      makeRequest({ sectionIds: [1], title: 'Merged' }) as never,
      makeParams()
    );
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toMatch(/at least 2/i);

    const res2 = await POST(
      makeRequest({ sectionIds: [], title: 'Merged' }) as never,
      makeParams()
    );
    expect(res2.status).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ sectionIds: [1, 2], title: '' }) as never,
      makeParams()
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/title/i);
  });

  it('returns 404 when some sections not found', async () => {
    // Mock select to return sections query (first call returns fewer sections than requested)
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.resolve([
              { id: 1, workspaceId: 1, parentSectionId: null, sortOrder: 0, title: 'A' },
            ])
          ),
        })),
      })),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ sectionIds: [1, 2], title: 'Merged' }) as never,
      makeParams()
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 400 when sections belong to different workspaces', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.resolve([
              { id: 1, workspaceId: 1, parentSectionId: null, sortOrder: 0, title: 'A' },
              { id: 2, workspaceId: 2, parentSectionId: null, sortOrder: 1, title: 'B' },
            ])
          ),
        })),
      })),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ sectionIds: [1, 2], title: 'Merged' }) as never,
      makeParams()
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/belong to this workspace/i);
  });

  it('returns 400 when sections have different parents', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.resolve([
              { id: 1, workspaceId: 1, parentSectionId: 10, sortOrder: 0, title: 'A' },
              { id: 2, workspaceId: 1, parentSectionId: 20, sortOrder: 1, title: 'B' },
            ])
          ),
        })),
      })),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ sectionIds: [1, 2], title: 'Merged' }) as never,
      makeParams()
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/same level/i);
  });

  it('creates merged section with combined content in transaction', async () => {
    const sections = [
      { id: 1, workspaceId: 1, parentSectionId: null, sortOrder: 0, title: 'Part A' },
      { id: 2, workspaceId: 1, parentSectionId: null, sortOrder: 1, title: 'Part B' },
    ];

    // First select: fetch sections
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(sections)),
        })),
      })),
    }));

    // Mock getLatestVersions to return content for each section
    mockGetLatestVersions.mockResolvedValue(
      new Map([
        [1, { sectionId: 1, content: 'Content from A', version: 1 }],
        [2, { sectionId: 2, content: 'Content from B', version: 1 }],
      ])
    );

    const capturedInsertValues: Record<string, unknown>[] = [];
    let txInsertCount = 0;

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockTx.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedInsertValues.push(vals);
        txInsertCount++;
        if (txInsertCount === 1) {
          // Creating the merged section
          return {
            returning: vi.fn(() =>
              Promise.resolve([
                {
                  id: 50,
                  title: 'Combined',
                  slug: 'combined',
                  workspaceId: 1,
                  sortOrder: 0,
                },
              ])
            ),
          };
        }
        // Creating the version
        return {
          returning: vi.fn(() => Promise.resolve([])),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makeRequest({ sectionIds: [1, 2], title: 'Combined' }) as never,
      makeParams()
    );
    expect(response.status).toBe(201);

    // First tx insert: create merged section
    expect(capturedInsertValues[0]?.title).toBe('Combined');
    expect(capturedInsertValues[0]?.slug).toBe('combined');
    expect(capturedInsertValues[0]?.workspaceId).toBe(1);
    expect(capturedInsertValues[0]?.template).toBe('prose');
    expect(capturedInsertValues[0]?.description as string).toMatch(/Part A/);
    expect(capturedInsertValues[0]?.description as string).toMatch(/Part B/);

    // Second tx insert: create version with merged content
    expect(capturedInsertValues[1]?.version).toBe(1);
    expect(capturedInsertValues[1]?.content).toBe('Content from A\n\n---\n\nContent from B');
    expect(capturedInsertValues[1]?.changeDescription as string).toMatch(/2 sections/);

    // Delete was called for original sections
    expect(mockTx.delete).toHaveBeenCalled();
  });
});
