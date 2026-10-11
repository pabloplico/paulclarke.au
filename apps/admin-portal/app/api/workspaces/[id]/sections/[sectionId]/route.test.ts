import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {
    workspace: { id: 1, title: 'Workspace' },
    section: { id: 10, title: 'Overview', slug: 'overview', template: 'prose', workspaceId: 1 },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  } as Record<string, unknown> | null,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceSectionParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: string, val: unknown) => ({ col, val }),
  like: (col: string, pattern: string) => ({ like: { col, pattern } }),
  desc: (col: string) => ({ desc: col }),
  count: () => 'count',
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaceSections: {
    id: 'id',
    parentSectionId: 'parentSectionId',
    workspaceId: 'workspaceId',
    slug: 'slug',
  },
  adminSectionVersions: { sectionId: 'sectionId', version: 'version' },
}));

let versionResult: unknown[] = [];
let updateResult: unknown[] = [];
let slugResult: { slug: string }[] = [];
let selectCount = 0;
const mockSet = vi.fn();

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        selectCount++;
        // First select after resolve-params is the version query (GET), the slug
        // collision lookup (PATCH with a title), or the child count (DELETE)
        if (selectCount === 1) {
          return Object.assign(Promise.resolve(slugResult), {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(versionResult)),
            })),
          });
        }
        return Promise.resolve([{ value: 0 }]);
      }),
    })),
  })),
  update: vi.fn(() => ({
    set: mockSet.mockImplementation(() => ({
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
  return new Request('http://localhost:3001/api/workspaces/1/sections/10', opts);
}

function makeParams(id = '1', sectionId = '10') {
  return { params: Promise.resolve({ id, sectionId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectCount = 0;
  versionResult = [];
  updateResult = [];
  slugResult = [];
  mockResolveResult.current = {
    workspace: { id: 1, title: 'Workspace' },
    section: { id: 10, title: 'Overview', slug: 'overview', template: 'prose', workspaceId: 1 },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/workspaces/[id]/sections/[sectionId]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns 404 when resolve fails', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }),
    };
    const GET = await getHandler();
    const response = await GET(makeRequest() as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('returns section with latest version', async () => {
    versionResult = [{ id: 1, version: 1, content: 'Hello world' }];

    const GET = await getHandler();
    const response = await GET(makeRequest() as never, makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Overview');
    expect(body.latestVersion.content).toBe('Hello world');
  });
});

describe('PATCH /api/workspaces/[id]/sections/[sectionId]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.PATCH;
  }

  it('returns 404 when resolve fails', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }),
    };
    const PATCH = await getHandler();
    const response = await PATCH(makeRequest('PATCH', { title: 'New' }) as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('updates section metadata and rules', async () => {
    updateResult = [{ id: 10, title: 'Updated', completenessRules: [] }];

    const PATCH = await getHandler();
    const response = await PATCH(
      makeRequest('PATCH', { title: 'Updated', completenessRules: [] }) as never,
      makeParams()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Updated');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'updated' }));
  });

  it('suffixes the slug when another section already uses it', async () => {
    slugResult = [{ slug: 'updated' }, { slug: 'updated-2' }];
    updateResult = [{ id: 10, title: 'Updated' }];

    const PATCH = await getHandler();
    const response = await PATCH(makeRequest('PATCH', { title: 'Updated' }) as never, makeParams());
    expect(response.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'updated-3' }));
  });

  it("keeps the section's own slug rather than suffixing it", async () => {
    mockResolveResult.current = {
      ...(mockResolveResult.current as Record<string, unknown>),
      section: { id: 10, title: 'Updated', slug: 'updated', template: 'prose', workspaceId: 1 },
    };
    slugResult = [{ slug: 'updated' }];
    updateResult = [{ id: 10, title: 'Updated' }];

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { title: 'Updated' }) as never, makeParams());
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ slug: 'updated' }));
  });
});

describe('DELETE /api/workspaces/[id]/sections/[sectionId]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.DELETE;
  }

  it('returns 404 when resolve fails', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Section not found' }, { status: 404 }),
    };
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE') as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('deletes section successfully', async () => {
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE') as never, makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
