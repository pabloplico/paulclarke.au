import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

const mockSearchAddresses = vi.fn();
vi.mock('@/lib/external-apis/google-places', () => ({
  searchAddresses: mockSearchAddresses,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost:3001/api/lookup/address${params}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchAddresses.mockResolvedValue([]);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/lookup/address', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty predictions for missing query', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.predictions).toEqual([]);
    expect(mockSearchAddresses).not.toHaveBeenCalled();
  });

  it('returns empty predictions for short query (< 3 chars)', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=12'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.predictions).toEqual([]);
    expect(mockSearchAddresses).not.toHaveBeenCalled();
  });

  it('returns predictions from searchAddresses', async () => {
    mockSearchAddresses.mockResolvedValue([
      { placeId: 'p1', description: '123 Main St, Sydney NSW 2000' },
      { placeId: 'p2', description: '123 Main Rd, Melbourne VIC 3000' },
    ]);

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=123 Main'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.predictions).toHaveLength(2);
    expect(body.predictions[0].description).toBe('123 Main St, Sydney NSW 2000');
    expect(mockSearchAddresses).toHaveBeenCalledWith('123 Main');
  });
});
