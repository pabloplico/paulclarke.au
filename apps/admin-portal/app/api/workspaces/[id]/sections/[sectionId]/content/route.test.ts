import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveResult = vi.hoisted(() => ({
  current: {
    workspace: { id: 1, title: 'Workspace' },
    section: { id: 10, title: 'Overview', workspaceId: 1 },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  } as Record<string, unknown> | null,
}));

vi.mock('@/lib/api/resolve-params', () => ({
  resolveWorkspaceSectionParams: vi.fn(() => Promise.resolve(mockResolveResult.current)),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaceSections: { id: 'id' },
  adminSectionVersions: { sectionId: 'sectionId', version: 'version' },
}));

let latestVersionResult: unknown[] = [];
let insertResult: unknown[] = [];

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
  return new Request('http://localhost:3001/api/workspaces/1/sections/10/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id = '1', sectionId = '10') {
  return { params: Promise.resolve({ id, sectionId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  latestVersionResult = [];
  insertResult = [];
  mockResolveResult.current = {
    workspace: { id: 1, title: 'Workspace' },
    section: { id: 10, title: 'Overview', workspaceId: 1 },
    user: { id: 1, email: 'test@test.com', name: 'Test', role: 'admin' },
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PUT /api/workspaces/[id]/sections/[sectionId]/content', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.PUT;
  }

  it('returns 404 when resolve fails', async () => {
    const { NextResponse } = await import('next/server');
    mockResolveResult.current = {
      error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }),
    };
    const PUT = await getHandler();
    const response = await PUT(makeRequest({ content: 'test' }) as never, makeParams());
    expect(response.status).toBe(404);
  });

  it('creates new version with incremented version number', async () => {
    latestVersionResult = [{ version: 3 }];
    insertResult = [{ id: 100, sectionId: 10, version: 4, content: 'Updated content' }];

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

    const PUT = await getHandler();
    const response = await PUT(
      makeRequest({
        content: 'Updated content',
        changeDescription: 'Edit',
        changeSource: 'manual',
      }) as never,
      makeParams()
    );
    expect(response.status).toBe(201);
    expect(capturedValues!.version).toBe(4);
    expect(capturedValues!.content).toBe('Updated content');
  });

  it('starts at version 1 when no versions exist', async () => {
    latestVersionResult = [];
    insertResult = [{ id: 101, sectionId: 10, version: 1, content: 'First content' }];

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

    const PUT = await getHandler();
    const response = await PUT(makeRequest({ content: 'First content' }) as never, makeParams());
    expect(response.status).toBe(201);
    expect(capturedValues!.version).toBe(1);
  });

  it('handles structuredData and changeSource', async () => {
    latestVersionResult = [{ version: 1 }];
    insertResult = [{ id: 102, sectionId: 10, version: 2 }];

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

    const PUT = await getHandler();
    await PUT(
      makeRequest({
        content: 'Markdown',
        structuredData: { items: [{ text: 'a' }] },
        changeSource: 'ai_edit',
      }) as never,
      makeParams()
    );
    expect(capturedValues!.structuredData).toEqual({ items: [{ text: 'a' }] });
    expect(capturedValues!.changeSource).toBe('ai_edit');
  });

  it('updates section updatedAt timestamp', async () => {
    latestVersionResult = [{ version: 1 }];
    insertResult = [{ id: 103, sectionId: 10, version: 2 }];

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(insertResult)),
      })),
    }));

    const PUT = await getHandler();
    await PUT(makeRequest({ content: 'test' }) as never, makeParams());
    expect(mockDb.update).toHaveBeenCalled();
  });
});
