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
  adminJobs: {
    id: 'id',
    userId: 'userId',
    clientId: 'clientId',
    stage: 'stage',
    sortOrder: 'sortOrder',
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
  return new Request(`http://localhost:3001/api/jobs${params}`, { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/jobs', {
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

describe('GET /api/jobs', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty array when no jobs exist', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns jobs with client names', async () => {
    queryResult = [
      {
        job: { id: 1, title: 'Website Redesign', stage: 'lead' },
        clientName: 'Alice',
        companyName: 'Acme',
      },
    ];
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].clientName).toBe('Alice');
  });

  it('filters by stage', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?stage=in_progress'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('filters by clientId', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?clientId=5'));
    expect(mockDb.select).toHaveBeenCalled();
  });

  // ── GAP-011: Filter assertion tests ────────────────────────────────────────

  it('TC-011-B3: no filters — only userId condition present', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest());
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toHaveLength(1);
    expect(arg.and[0]).toEqual({ col: 'userId', val: 1 });
  });

  it('TC-011-B1: stage filter — where receives eq for adminJobs.stage', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?stage=in_progress'));
    const arg = capturedWhereArg as { and: unknown[] };
    expect(arg.and).toContainEqual({ col: 'stage', val: 'in_progress' });
  });

  it('TC-011-B2: clientId filter — where receives eq with numeric value (Number() coercion)', async () => {
    const GET = await getHandler();
    await GET(makeGetRequest('?clientId=5'));
    const arg = capturedWhereArg as { and: unknown[] };
    // The handler calls Number(clientId), so value must be a number not a string
    expect(arg.and).toContainEqual({ col: 'clientId', val: 5 });
  });
});

describe('POST /api/jobs', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when title is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ description: 'Some work' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Title is required');
  });

  it('returns 400 when title is empty', async () => {
    const POST = await getHandler();
    const response = await POST(makePostRequest({ title: '   ' }));
    expect(response.status).toBe(400);
  });

  it('creates job with valid data', async () => {
    insertResult = [{ id: 1, title: 'Website Redesign', stage: 'lead' }];
    const POST = await getHandler();
    const response = await POST(makePostRequest({ title: 'Website Redesign', clientId: 1 }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe('Website Redesign');
  });

  it('defaults stage to lead', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ title: 'Test Job' }));
    expect(capturedValues.stage).toBe('lead');
  });

  it('converts date strings to Date objects', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ title: 'Test', startDate: '2024-06-01', dueDate: '2024-07-01' }));
    expect(capturedValues.startDate).toBeInstanceOf(Date);
    expect(capturedValues.dueDate).toBeInstanceOf(Date);
  });

  it('sets null clientId when not provided', async () => {
    let capturedValues: Record<string, unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (mockDb.insert as any).mockImplementation(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn(() => Promise.resolve([{ id: 1, ...vals }])) };
      }),
    }));

    const POST = await getHandler();
    await POST(makePostRequest({ title: 'Solo Job' }));
    expect(capturedValues.clientId).toBeNull();
  });
});
