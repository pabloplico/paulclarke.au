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
  adminClients: {
    id: 'id',
    userId: 'userId',
    metadata: 'metadata',
  },
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
  return new Request('http://localhost:3001/api/clients/1', opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [];
  updateResult = [];
  deleteResult = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/clients/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns client when found', async () => {
    selectResult = [{ id: 1, contactName: 'Alice', companyName: 'Acme' }];
    const GET = await getHandler();
    const response = await GET(makeRequest('GET'), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contactName).toBe('Alice');
  });

  it('returns 404 when not found', async () => {
    selectResult = [];
    const GET = await getHandler();
    const response = await GET(makeRequest('GET'), makeParams('999'));
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/clients/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.PATCH;
  }

  it('updates client fields', async () => {
    updateResult = [{ id: 1, contactName: 'Alice Updated' }];
    const PATCH = await getHandler();
    const response = await PATCH(
      makeRequest('PATCH', { contactName: 'Alice Updated' }),
      makeParams()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contactName).toBe('Alice Updated');
  });

  it('returns 404 when client not found', async () => {
    updateResult = [];
    const PATCH = await getHandler();
    const response = await PATCH(makeRequest('PATCH', { contactName: 'X' }), makeParams('999'));
    expect(response.status).toBe(404);
  });

  it('merges metadata instead of replacing', async () => {
    // First select for existing metadata
    selectResult = [{ metadata: { abn: '123', industry: 'Tech' } }];
    updateResult = [{ id: 1, metadata: { abn: '123', industry: 'Tech', source: 'referral' } }];

    let capturedSet: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.update as any).mockImplementation(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        capturedSet = vals;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(updateResult)),
          })),
        };
      }),
    }));

    const PATCH = await getHandler();
    await PATCH(makeRequest('PATCH', { metadata: { source: 'referral' } }), makeParams());
    expect(capturedSet.metadata).toEqual({ abn: '123', industry: 'Tech', source: 'referral' });
  });
});

describe('DELETE /api/clients/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.DELETE;
  }

  it('deletes client and returns ok', async () => {
    deleteResult = [{ id: 1 }];
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE'), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it('returns 404 when client not found', async () => {
    deleteResult = [];
    const DELETE = await getHandler();
    const response = await DELETE(makeRequest('DELETE'), makeParams('999'));
    expect(response.status).toBe(404);
  });
});
