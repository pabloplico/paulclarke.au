import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  inArray: (col: string, vals: unknown) => ({ col, vals }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminClients: {
    id: 'id',
    userId: 'userId',
  },
}));

let queryResult: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(queryResult)),
    })),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock('@/lib/config.server', () => ({
  loadConfig: vi.fn(() => Promise.resolve({ ai: {} })),
}));

const mockGetModel = vi.fn(() => 'mock-model');
vi.mock('@/lib/ai/models', () => ({
  getModel: () => mockGetModel(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/outreach/personalise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const testClients = [
  {
    id: 1,
    userId: 1,
    contactName: 'Alice',
    companyName: 'Acme Corp',
    email: 'alice@acme.com',
    industry: 'Technology',
    notes: 'Interested in AI solutions',
  },
  {
    id: 2,
    userId: 1,
    contactName: 'Bob',
    companyName: 'Beta Inc',
    email: 'bob@beta.com',
    industry: 'Finance',
    notes: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = [];
  mockGenerateText.mockResolvedValue({ text: 'Personalised email text' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/outreach/personalise', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when template is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ clientIds: [1] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Template is required');
  });

  it('returns 400 when clientIds is empty', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ template: 'Hello', clientIds: [] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('At least one client must be selected');
  });

  it('returns 404 when no valid clients found', async () => {
    queryResult = [{ id: 1, userId: 999, contactName: 'Other' }];
    const POST = await getHandler();
    const response = await POST(makeRequest({ template: 'Hello', clientIds: [1] }));
    expect(response.status).toBe(404);
  });

  it('returns personalised results for valid clients', async () => {
    queryResult = testClients;
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ template: 'Hi there, lets connect.', clientIds: [1, 2] })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].contactName).toBe('Alice');
    expect(body.results[0].personalisedBody).toBe('Personalised email text');
    expect(body.results[1].contactName).toBe('Bob');
  });

  it('calls generateText with system prompt containing tone instruction', async () => {
    queryResult = [testClients[0]];
    const POST = await getHandler();
    await POST(makeRequest({ template: 'Hello!', clientIds: [1], tone: 'Friendly' }));
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const call = mockGenerateText.mock.calls[0]![0];
    expect(call.system).toContain('friendly');
  });

  it('includes client context in user message', async () => {
    queryResult = [testClients[0]];
    const POST = await getHandler();
    await POST(makeRequest({ template: 'Hello!', clientIds: [1] }));
    const call = mockGenerateText.mock.calls[0]![0];
    const userMsg = call.messages[0].content;
    expect(userMsg).toContain('Alice');
    expect(userMsg).toContain('Acme Corp');
    expect(userMsg).toContain('Technology');
    expect(userMsg).toContain('Interested in AI solutions');
  });

  it('handles individual client AI failures gracefully', async () => {
    queryResult = testClients;
    mockGenerateText
      .mockResolvedValueOnce({ text: 'OK email' })
      .mockRejectedValueOnce(new Error('Rate limit exceeded'));

    const POST = await getHandler();
    const response = await POST(makeRequest({ template: 'Hello!', clientIds: [1, 2] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].personalisedBody).toBe('OK email');
    expect(body.results[0].error).toBeUndefined();
    expect(body.results[1].error).toBe('Rate limit exceeded');
    expect(body.results[1].personalisedBody).toBe('');
  });

  it('truncates long notes to 500 chars', async () => {
    const longNotes = 'x'.repeat(1000);
    queryResult = [{ ...testClients[0], notes: longNotes }];
    const POST = await getHandler();
    await POST(makeRequest({ template: 'Hello!', clientIds: [1] }));
    const call = mockGenerateText.mock.calls[0]![0];
    const userMsg = call.messages[0].content;
    // Notes should be truncated — the full 1000-char string should NOT appear
    expect(userMsg).not.toContain(longNotes);
    expect(userMsg).toContain('x'.repeat(500));
  });
});
