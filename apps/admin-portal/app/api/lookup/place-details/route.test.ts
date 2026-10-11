import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

const mockGetPlaceDetails = vi.fn();
vi.mock('@/lib/external-apis/google-places', () => ({
  getPlaceDetails: mockGetPlaceDetails,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost:3001/api/lookup/place-details${params}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/lookup/place-details', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns 400 when placeId is missing', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('placeId required');
  });

  it('returns 404 when getPlaceDetails returns null', async () => {
    mockGetPlaceDetails.mockResolvedValue(null);
    const GET = await getHandler();
    const response = await GET(makeGetRequest('?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Place not found');
  });

  it('returns details on success', async () => {
    const placeDetails = {
      formattedAddress: '123 George St, Sydney NSW 2000, Australia',
      phone: '+61 2 9876 5432',
      website: 'https://example.com.au',
      lat: -33.8688,
      lng: 151.2093,
    };
    mockGetPlaceDetails.mockResolvedValue(placeDetails);

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.formattedAddress).toBe('123 George St, Sydney NSW 2000, Australia');
    expect(body.website).toBe('https://example.com.au');
    expect(mockGetPlaceDetails).toHaveBeenCalledWith('ChIJN1t_tDeuEmsRUsoyG83frY4');
  });
});
