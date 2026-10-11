import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  isNull: (col: string) => ({ isNull: col }),
  inArray: (col: string, vals: unknown[]) => ({ inArray: col, vals }),
  count: (col: string) => ({ count: col }),
  max: (col: string) => ({ max: col }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaces: {
    id: 'id',
    userId: 'userId',
    archivedAt: 'archivedAt',
    sortOrder: 'sortOrder',
  },
  adminWorkspaceSections: {
    id: 'id',
    workspaceId: 'workspaceId',
  },
  adminSectionVersions: {
    sectionId: 'sectionId',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/workspaces/templates', () => ({
  WORKSPACE_TEMPLATES: [
    {
      id: 'client-project',
      name: 'Client Project',
      icon: 'briefcase',
      sections: [
        { title: 'Overview', slug: 'overview', template: 'prose', description: 'Overview' },
        { title: 'Tasks', slug: 'tasks', template: 'checklist', description: 'Tasks' },
      ],
    },
    {
      id: 'custom',
      name: 'Custom',
      icon: 'clipboard-list',
      sections: [],
    },
  ],
}));

// DB mock state
let workspacesResult: unknown[] = [];
let sectionStatsResult: unknown[] = [];
let maxSortResult: unknown[] = [];
let insertResult: unknown[] = [];
let sectionInsertResult: unknown[] = [];
let versionInsertCalls: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(workspacesResult)),
      })),
      leftJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => Promise.resolve(sectionStatsResult)),
        })),
      })),
      groupBy: vi.fn(() => Promise.resolve(sectionStatsResult)),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(insertResult)),
    })),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(): Request {
  return new Request('http://localhost:3001/api/workspaces', { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  workspacesResult = [];
  sectionStatsResult = [];
  maxSortResult = [{ maxSort: 0 }];
  insertResult = [];
  sectionInsertResult = [];
  versionInsertCalls = [];

  // Reset select mock for different query patterns
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (mockDb.select as any).mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(workspacesResult)),
      })),
      leftJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => Promise.resolve(sectionStatsResult)),
        })),
      })),
    })),
  }));
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/workspaces', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty array when no workspaces exist', async () => {
    workspacesResult = [];
    const GET = await getHandler();
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns workspaces with section stats', async () => {
    workspacesResult = [
      { id: 1, title: 'WS1', slug: 'ws1', sortOrder: 0, updatedAt: '2024-01-01' },
    ];
    sectionStatsResult = [{ workspaceId: 1, sectionCount: 3, lastUpdated: '2024-02-01' }];

    const GET = await getHandler();
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].sectionCount).toBe(3);
    expect(body[0].lastUpdated).toBe('2024-02-01');
  });

  it('defaults sectionCount to 0 when no stats', async () => {
    workspacesResult = [
      { id: 2, title: 'WS2', slug: 'ws2', sortOrder: 0, updatedAt: '2024-01-01' },
    ];
    sectionStatsResult = [];

    const GET = await getHandler();
    const response = await GET();
    const body = await response.json();
    expect(body[0].sectionCount).toBe(0);
    expect(body[0].lastUpdated).toBe('2024-01-01');
  });
});

describe('POST /api/workspaces', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when title is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ slug: 'test' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Title and slug are required');
  });

  it('returns 400 when slug is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ title: 'Test' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Title and slug are required');
  });

  it('creates workspace without template', async () => {
    let selectCallCount = 0;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve([{ maxSort: 2 }]);
          }
          return Promise.resolve([]);
        }),
      })),
    }));
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() =>
          Promise.resolve([{ id: 1, title: 'Test', slug: 'test', sortOrder: 3 }])
        ),
      })),
    }));

    const POST = await getHandler();
    const response = await POST(makePostRequest({ title: 'Test', slug: 'Test Slug' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe('Test');
    expect(body.sectionCount).toBe(0);
  });

  it('creates workspace with template sections', async () => {
    let selectCallCount = 0;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCallCount++;
          return Promise.resolve([{ maxSort: 0 }]);
        }),
      })),
    }));

    const insertCalls: unknown[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: unknown) => {
        insertCalls.push(vals);
        return {
          returning: vi.fn(() =>
            Promise.resolve([{ id: insertCalls.length, title: 'Created', slug: 'created' }])
          ),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makePostRequest({ title: 'Test', slug: 'test', templateId: 'client-project' })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.sectionCount).toBe(2);
  });

  it('creates workspace with custom sections', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ maxSort: 0 }])),
      })),
    }));

    const insertCalls: unknown[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: unknown) => {
        insertCalls.push(vals);
        return {
          returning: vi.fn(() =>
            Promise.resolve([{ id: insertCalls.length, title: 'Created', slug: 'created' }])
          ),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makePostRequest({
        title: 'Custom',
        slug: 'custom',
        templateId: 'custom',
        customSections: [
          { title: 'Section A', template: 'prose' },
          { title: 'Section B', template: 'cards' },
        ],
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.sectionCount).toBe(2);
  });

  it('creates workspace with category', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ maxSort: 0 }])),
      })),
    }));

    let capturedValues: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (!capturedValues) capturedValues = vals;
        return {
          returning: vi.fn(() =>
            Promise.resolve([{ id: 1, title: 'Test', slug: 'test', category: 'Finance' }])
          ),
        };
      }),
    }));

    const POST = await getHandler();
    const response = await POST(
      makePostRequest({ title: 'Test', slug: 'test', category: 'Finance' })
    );
    expect(response.status).toBe(201);
    expect(capturedValues!.category).toBe('Finance');
  });

  it('sets category to null when not provided', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ maxSort: 0 }])),
      })),
    }));

    let capturedValues: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (!capturedValues) capturedValues = vals;
        return {
          returning: vi.fn(() =>
            Promise.resolve([{ id: 1, title: 'Test', slug: 'test', category: null }])
          ),
        };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ title: 'Test', slug: 'test' }));
    expect(capturedValues!.category).toBeNull();
  });

  it('normalizes slug to lowercase with hyphens', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ maxSort: 0 }])),
      })),
    }));

    let capturedValues: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (!capturedValues) capturedValues = vals;
        return {
          returning: vi.fn(() => Promise.resolve([{ id: 1, title: 'Test', slug: 'my-test-slug' }])),
        };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ title: 'Test', slug: 'My Test Slug!' }));
    expect(capturedValues!.slug).toBe('my-test-slug-');
  });
});
