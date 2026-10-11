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
  adminEmailTemplates: { id: 'id', userId: 'userId' },
}));

let updateResult: unknown[] = [];
let deleteResult: unknown[] = [];

const mockDb = {
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
  return new Request('http://localhost:3001/api/email-templates/1', opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  updateResult = [];
  deleteResult = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PATCH /api/email-templates/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.PATCH;
  }

  it('updates template fields', async () => {
    updateResult = [{ id: 1, name: 'Updated Template', body: 'New body' }];
    const PATCH = await getHandler();
    const response = await PATCH(
      makeRequest('PATCH', { name: 'Updated Template', body: 'New body' }),
      makeParams()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe('Updated Template');
  });

  it('returns 404 when not found', async () => {
    updateResult = [];
    const PATCH = await getHandler();
    const response = await PATCH(makeRequest('PATCH', { name: 'X' }), makeParams('999'));
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/email-templates/[id]', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.DELETE;
  }

  it('deletes template and returns ok', async () => {
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
