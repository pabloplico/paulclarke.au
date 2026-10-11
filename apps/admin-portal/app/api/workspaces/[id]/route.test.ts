import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

const mockResolveWorkspace = vi.fn();
vi.mock('@/lib/workspaces/resolve', () => ({
  resolveWorkspace: (...args: unknown[]) => mockResolveWorkspace(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
}));

// biome-ignore lint/suspicious/noExplicitAny: test mock
const mockGetLatestVersions = vi.fn<any>(() => Promise.resolve(new Map()));
vi.mock('@/lib/workspaces/latest-versions', () => ({
  getLatestVersions: mockGetLatestVersions,
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaces: { id: 'id' },
  adminWorkspaceSections: { id: 'id', workspaceId: 'workspaceId', sortOrder: 'sortOrder' },
  adminSectionVersions: { sectionId: 'sectionId', version: 'version' },
}));

let sectionsResult: unknown[] = [];
let versionsResult: unknown[] = [];
let updateResult: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(sectionsResult)),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(updateResult)),
      })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(method = 'GET', body?: Record<string, unknown>): Request {
  const opts: RequestInit = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  return new Request('http://localhost:3001/api/workspaces/1', opts);
}

function makeParams(id = '1') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sectionsResult = [];
  versionsResult = [];
  updateResult = [];
  mockResolveWorkspace.mockResolvedValue({ id: 1, title: 'Workspace', slug: 'workspace' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/workspaces/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns 404 when workspace not found', async () => {
    mockResolveWorkspace.mockResolvedValue(null);
    const GET = await getHandler();
    const response = await GET(makeRequest() as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('returns workspace with sections', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.resolve([{ id: 10, title: 'Section 1', template: 'prose' }])
          ),
        })),
      })),
    }));

    mockGetLatestVersions.mockResolvedValue(
      new Map([[10, { version: 1, content: 'Hello', sectionId: 10 }]])
    );

    const GET = await getHandler();
    const response = await GET(makeRequest() as never, makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Workspace');
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].latestVersion).toBeTruthy();
    expect(mockGetLatestVersions).toHaveBeenCalledWith([10]);
  });

  it('resolves workspace by slug', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
      })),
    }));

    const GET = await getHandler();
    await GET(makeRequest() as never, makeParams('my-workspace'));
    expect(mockResolveWorkspace).toHaveBeenCalledWith('my-workspace', 1);
  });
});

describe('PATCH /api/workspaces/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.PATCH;
  }

  it('returns 404 when workspace not found', async () => {
    mockResolveWorkspace.mockResolvedValue(null);
    const PATCH = await getHandler();
    const response = await PATCH(
      makeRequest('PATCH', { title: 'New Title' }) as never,
      makeParams()
    );
    expect(response.status).toBe(404);
  });

  it('updates workspace fields', async () => {
    updateResult = [{ id: 1, title: 'Updated', description: 'New desc' }];
    const PATCH = await getHandler();
    const response = await PATCH(
      makeRequest('PATCH', { title: 'Updated', description: 'New desc' }) as never,
      makeParams()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Updated');
  });

  it('archives workspace when archived=true', async () => {
    updateResult = [{ id: 1, title: 'WS', archivedAt: '2024-01-01' }];

    let capturedSet: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((data: Record<string, unknown>) => {
        capturedSet = data;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(updateResult)),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { archived: true }) as never, makeParams());
    expect(capturedSet!.archivedAt).toBeInstanceOf(Date);
  });

  it('updates category field', async () => {
    updateResult = [{ id: 1, title: 'WS', category: 'Finance' }];

    let capturedSet: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((data: Record<string, unknown>) => {
        capturedSet = data;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(updateResult)),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { category: 'Finance' }) as never, makeParams());
    expect(capturedSet!.category).toBe('Finance');
  });

  it('unarchives workspace when archived=false', async () => {
    updateResult = [{ id: 1, title: 'WS', archivedAt: null }];

    let capturedSet: Record<string, unknown> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((data: Record<string, unknown>) => {
        capturedSet = data;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(updateResult)),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { archived: false }) as never, makeParams());
    expect(capturedSet!.archivedAt).toBeNull();
  });
});

describe('DELETE /api/workspaces/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.DELETE;
  }

  it('returns 404 when workspace not found', async () => {
    mockResolveWorkspace.mockResolvedValue(null);
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE') as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('deletes workspace successfully', async () => {
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE') as never, makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
