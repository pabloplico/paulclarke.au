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
  or: (...args: unknown[]) => ({ or: args }),
  ilike: (col: string, val: unknown) => ({ ilike: col, val }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminClients: {
    id: 'id',
    userId: 'userId',
    contactName: 'contactName',
    companyName: 'companyName',
    email: 'email',
    status: 'status',
    type: 'type',
    createdAt: 'createdAt',
  },
}));

let queryResult: unknown[] = [];
let insertResult: unknown[] = [];
let capturedWhereArg: unknown;

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((arg: unknown) => {
        capturedWhereArg = arg;
        return { orderBy: vi.fn(() => Promise.resolve(queryResult)) };
      }),
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
  return new Request(`http://localhost:3001/api/clients${params}`, { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = [];
  insertResult = [];
  capturedWhereArg = undefined;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/clients', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty array when no clients exist', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns clients list', async () => {
    queryResult = [
      { id: 1, contactName: 'Alice', companyName: 'Acme', status: 'active' },
      { id: 2, contactName: 'Bob', companyName: 'Beta', status: 'lead' },
    ];
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0].contactName).toBe('Alice');
  });

  it('filters by status', async () => {
    queryResult = [];
    const GET = await getHandler();
    await GET(makeGetRequest('?status=active'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters by type', async () => {
    queryResult = [];
    const GET = await getHandler();
    await GET(makeGetRequest('?type=lead'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters by search term', async () => {
    queryResult = [];
    const GET = await getHandler();
    await GET(makeGetRequest('?search=alice'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  // ── GAP-011: Filter assertion tests ────────────────────────────────────────

  it('TC-011-A4: no filters — where only contains the userId eq condition', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest());
    // capturedWhereArg is the result of and(...conditions)
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toHaveLength(1);
    expect(arg.and[0]).toEqual({ col: 'userId', val: 1 });
  });

  it('TC-011-A1: status filter — where receives an eq condition for adminClients.status', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?status=active'));
    const arg = capturedWhereArg as { and: unknown[] };
    // conditions: [userId eq, status eq]
    expect(arg.and).toContainEqual({ col: 'status', val: 'active' });
  });

  it('TC-011-A2: type filter — where receives an eq condition for adminClients.type', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?type=referral_partner'));
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toContainEqual({ col: 'type', val: 'referral_partner' });
  });

  it('TC-011-A3: search filter — where receives an or wrapping three ilike conditions', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?search=alice'));
    const arg = capturedWhereArg as { and: unknown[] };
    // Find the or() entry in the and array
    const orEntry = arg.and.find(
      (c) => typeof c === 'object' && c !== null && 'or' in (c as object)
    ) as { or: unknown[] } | undefined;
    expect(orEntry).toBeDefined();
    expect(orEntry!.or).toHaveLength(3);
    expect(orEntry!.or).toContainEqual({ ilike: 'contactName', val: '%alice%' });
    expect(orEntry!.or).toContainEqual({ ilike: 'companyName', val: '%alice%' });
    expect(orEntry!.or).toContainEqual({ ilike: 'email', val: '%alice%' });
  });

  it('TC-011-A5: combined status + type — both conditions present', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?status=active&type=client'));
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toContainEqual({ col: 'status', val: 'active' });
    expect(arg.and).toContainEqual({ col: 'type', val: 'client' });
  });
});

describe('POST /api/clients', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when contactName is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ companyName: 'Acme' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Contact name is required');
  });

  it('returns 400 when contactName is empty', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ contactName: '   ' }));
    expect(response.status).toBe(400);
  });

  it('creates client with valid data', async () => {
    insertResult = [
      { id: 1, contactName: 'Alice', companyName: 'Acme', status: 'lead', type: 'lead' },
    ];
    const POST = await getHandler();
    const response = await POST(
      makePostRequest({ contactName: 'Alice', companyName: 'Acme', email: 'alice@acme.com' })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.contactName).toBe('Alice');
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('defaults status and type to lead', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ contactName: 'Alice' }));
    expect(capturedValues.status).toBe('lead');
    expect(capturedValues.type).toBe('lead');
  });

  it('trims contactName', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ contactName: '  Alice  ' }));
    expect(capturedValues.contactName).toBe('Alice');
  });
});
