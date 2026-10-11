import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

const mockSearchAbnByName = vi.fn();
vi.mock('@/lib/external-apis/abn-lookup', () => ({
  searchAbnByName: mockSearchAbnByName,
}));

const mockSearchPlaces = vi.fn();
vi.mock('@/lib/external-apis/google-places', () => ({
  searchPlaces: mockSearchPlaces,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost:3001/api/lookup/company${params}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchAbnByName.mockResolvedValue([]);
  mockSearchPlaces.mockResolvedValue([]);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/lookup/company', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty suggestions for missing query', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toEqual([]);
  });

  it('returns empty suggestions for short query (< 2 chars)', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=A'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toEqual([]);
    expect(mockSearchAbnByName).not.toHaveBeenCalled();
  });

  it('returns combined ABN + Places results', async () => {
    mockSearchAbnByName.mockResolvedValue([
      { source: 'abn', companyName: 'Acme Pty Ltd', abn: '12345678901' },
    ]);
    mockSearchPlaces.mockResolvedValue([
      { source: 'places', companyName: 'Acme Solutions', placeId: 'place123' },
    ]);

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=Acme'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].companyName).toBe('Acme Pty Ltd');
    expect(body.suggestions[1].companyName).toBe('Acme Solutions');
  });

  it('deduplicates by case-insensitive company name', async () => {
    mockSearchAbnByName.mockResolvedValue([
      { source: 'abn', companyName: 'Acme Pty Ltd', abn: '12345678901' },
    ]);
    mockSearchPlaces.mockResolvedValue([
      { source: 'places', companyName: 'acme pty ltd', placeId: 'place123' },
    ]);

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=Acme'));
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].source).toBe('abn');
  });

  it('caps results at 8', async () => {
    const abnResults = Array.from({ length: 6 }, (_, i) => ({
      source: 'abn',
      companyName: `ABN Company ${i}`,
      abn: `1234567890${i}`,
    }));
    const placesResults = Array.from({ length: 6 }, (_, i) => ({
      source: 'places',
      companyName: `Places Company ${i}`,
      placeId: `place${i}`,
    }));
    mockSearchAbnByName.mockResolvedValue(abnResults);
    mockSearchPlaces.mockResolvedValue(placesResults);

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=Company'));
    const body = await response.json();
    expect(body.suggestions).toHaveLength(8);
  });

  it('handles ABN source failing gracefully', async () => {
    mockSearchAbnByName.mockRejectedValue(new Error('ABN API down'));
    mockSearchPlaces.mockResolvedValue([
      { source: 'places', companyName: 'Acme Solutions', placeId: 'place123' },
    ]);

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=Acme'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].companyName).toBe('Acme Solutions');
  });

  it('handles Places source failing gracefully', async () => {
    mockSearchAbnByName.mockResolvedValue([
      { source: 'abn', companyName: 'Acme Pty Ltd', abn: '12345678901' },
    ]);
    mockSearchPlaces.mockRejectedValue(new Error('Places API down'));

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?q=Acme'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].companyName).toBe('Acme Pty Ltd');
  });
});
