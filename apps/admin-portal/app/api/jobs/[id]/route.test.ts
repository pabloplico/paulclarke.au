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
}));

vi.mock('@/lib/db/schema', () => ({
  adminJobs: { id: 'id', userId: 'userId' },
}));

let selectResult: unknown[] = [];
let updateResult: unknown[] = [];
let deleteResult: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(selectResult)),
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
    where: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(deleteResult)),
    })),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeParams(id = '1') {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(method: string, body?: Record<string, unknown>): Request {
  const opts: RequestInit = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  return new Request('http://localhost:3001/api/jobs/1', opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [];
  updateResult = [];
  deleteResult = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/jobs/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns job when found', async () => {
    selectResult = [{ id: 1, title: 'Website Redesign', stage: 'lead' }];
    const GET = await getHandler();
    const response = await GET(makeRequest('GET'), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Website Redesign');
  });

  it('returns 404 when not found', async () => {
    selectResult = [];
    const GET = await getHandler();
    const response = await GET(makeRequest('GET'), makeParams('999'));
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/jobs/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.PATCH;
  }

  it('updates job fields', async () => {
    updateResult = [{ id: 1, title: 'Updated Title', stage: 'quoted' }];
    const PATCH = await getHandler();
    const response = await PATCH(makeRequest('PATCH', { title: 'Updated Title' }), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Updated Title');
  });

  it('returns 404 when not found', async () => {
    updateResult = [];
    const PATCH = await getHandler();
    const response = await PATCH(makeRequest('PATCH', { title: 'X' }), makeParams('999'));
    expect(response.status).toBe(404);
  });

  it('sets completedAt when stage changes to complete', async () => {
    let capturedSet: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        capturedSet = vals;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 1, stage: 'complete' }])),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { stage: 'complete' }), makeParams());
    expect(capturedSet.completedAt).toBeInstanceOf(Date);
  });

  it('does not set completedAt for non-complete stages', async () => {
    let capturedSet: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        capturedSet = vals;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 1, stage: 'quoted' }])),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { stage: 'quoted' }), makeParams());
    expect(capturedSet.completedAt).toBeUndefined();
  });

  it('only updates provided fields', async () => {
    let capturedSet: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        capturedSet = vals;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 1 }])),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { title: 'New Title' }), makeParams());
    expect(capturedSet.title).toBe('New Title');
    expect(capturedSet.description).toBeUndefined();
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
  });
});

describe('DELETE /api/jobs/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.DELETE;
  }

  it('deletes job and returns ok', async () => {
    deleteResult = [{ id: 1 }];
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE'), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it('returns 404 when not found', async () => {
    deleteResult = [];
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE'), makeParams('999'));
    expect(response.status).toBe(404);
  });
});
