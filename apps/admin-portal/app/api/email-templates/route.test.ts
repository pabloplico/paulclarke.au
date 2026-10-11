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
  desc: (col: string) => ({ desc: col }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminEmailTemplates: {
    id: 'id',
    userId: 'userId',
    category: 'category',
    createdAt: 'createdAt',
  },
}));

let queryResult: unknown[] = [];
let insertResult: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(queryResult)),
      })),
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

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost:3001/api/email-templates${params}`, { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/email-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = [];
  insertResult = [];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/email-templates', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty array when no templates exist', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns templates list', async () => {
    queryResult = [
      { id: 1, name: 'Welcome', category: 'initial_outreach' },
      { id: 2, name: 'Follow Up', category: 'follow_up' },
    ];
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    const body = await response.json();
    expect(body).toHaveLength(2);
  });

  it('filters by category', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?category=follow_up'));
    expect(mockDb.select).toHaveBeenCalled();
  });
});

describe('POST /api/email-templates', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when name is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ body: 'Hello {{name}}' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Name is required');
  });

  it('returns 400 when name is empty', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ name: '   ', body: 'Hello' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ name: 'Welcome Email' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Body is required');
  });

  it('returns 400 when body is empty', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ name: 'Welcome', body: '   ' }));
    expect(response.status).toBe(400);
  });

  it('creates template with valid data', async () => {
    insertResult = [{ id: 1, name: 'Welcome', body: 'Hello {{name}}', category: 'general' }];
    const POST = await getHandler();
    const response = await POST(
      makePostRequest({ name: 'Welcome', subject: 'Welcome!', body: 'Hello {{name}}' })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe('Welcome');
  });

  it('defaults category to general', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ name: 'Test', body: 'Hello' }));
    expect(capturedValues.category).toBe('general');
  });

  it('trims name and body', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ name: '  Welcome  ', body: '  Hello  ' }));
    expect(capturedValues.name).toBe('Welcome');
    expect(capturedValues.body).toBe('Hello');
  });
});
