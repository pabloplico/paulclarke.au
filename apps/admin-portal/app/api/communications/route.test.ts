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
  isNull: (col: string) => ({ isNull: col }),
  lte: (col: string, val: unknown) => ({ lte: col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminCommunications: {
    id: 'id',
    userId: 'userId',
    clientId: 'clientId',
    type: 'type',
    followUpDone: 'followUpDone',
    followUpDate: 'followUpDate',
    createdAt: 'createdAt',
  },
  adminClients: {
    id: 'id',
    contactName: 'contactName',
    companyName: 'companyName',
  },
}));

let queryResult: unknown[] = [];
let insertResult: unknown[] = [];
let capturedWhereArg: unknown;

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      leftJoin: vi.fn(() => ({
        where: vi.fn((arg: unknown) => {
          capturedWhereArg = arg;
          return { orderBy: vi.fn(() => Promise.resolve(queryResult)) };
        }),
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
  return new Request(`http://localhost:3001/api/communications${params}`, { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/communications', {
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

describe('GET /api/communications', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty array when no communications exist', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns communications with client names', async () => {
    queryResult = [
      {
        communication: { id: 1, type: 'email', subject: 'Hello' },
        clientName: 'Alice',
        companyName: 'Acme',
      },
    ];
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].clientName).toBe('Alice');
  });

  it('filters by clientId', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?clientId=5'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters by type', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?type=email'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters pending follow-ups', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?followUp=pending'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters overdue follow-ups', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?followUp=overdue'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  // ── GAP-011: Filter assertion tests ────────────────────────────────────────

  it('TC-011-C1: clientId filter — where receives eq with numeric value (Number() coercion)', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?clientId=3'));
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toContainEqual({ col: 'clientId', val: 3 });
  });

  it('TC-011-C2: type filter — where receives eq for adminCommunications.type', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?type=phone'));
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toContainEqual({ col: 'type', val: 'phone' });
  });

  it('TC-011-C3: followUp=pending — conditions include followUpDone eq false and IS NOT NULL sql fragment', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?followUp=pending'));
    const arg = capturedWhereArg as { and: unknown[] };
    // userId + followUpDone + IS NOT NULL sql = at least 3 conditions
    expect(arg.and.length).toBeGreaterThanOrEqual(3);
    expect(arg.and).toContainEqual({ col: 'followUpDone', val: false });
    // The sql fragment is the IS NOT NULL condition — verify one element has a 'sql' key
    const hasSqlFragment = arg.and.some(
      (c) => typeof c === 'object' && c !== null && 'sql' in (c as object)
    );
    expect(hasSqlFragment).toBe(true);
  });

  it('TC-011-C4: followUp=overdue — conditions include lte on followUpDate with a Date instance', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?followUp=overdue'));
    const arg = capturedWhereArg as { and: unknown[] };
    // Find the lte condition
    const lteCondition = arg.and.find(
      (c) => typeof c === 'object' && c !== null && 'lte' in (c as object)
    ) as { lte: string; val: unknown } | undefined;
    expect(lteCondition).toBeDefined();
    expect(lteCondition!.lte).toBe('followUpDate');
    expect(lteCondition!.val).toBeInstanceOf(Date);
  });
});

describe('POST /api/communications', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when type is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ subject: 'Hello' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Type is required');
  });

  it('creates communication with valid data', async () => {
    insertResult = [{ id: 1, type: 'email', subject: 'Hello', direction: 'outbound' }];
    const POST = await getHandler();
    const response = await POST(
      makePostRequest({ type: 'email', subject: 'Hello', body: 'Hi there', clientId: 1 })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.type).toBe('email');
  });

  it('defaults direction to outbound', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ type: 'phone' }));
    expect(capturedValues.direction).toBe('outbound');
  });

  it('sets sentAt to now when not provided', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ type: 'email' }));
    expect(capturedValues.sentAt).toBeInstanceOf(Date);
  });

  it('converts followUpDate string to Date', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ type: 'meeting', followUpDate: '2024-07-01' }));
    expect(capturedValues.followUpDate).toBeInstanceOf(Date);
  });
});
