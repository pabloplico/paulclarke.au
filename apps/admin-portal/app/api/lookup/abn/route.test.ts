import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

const mockLookupAbn = vi.fn();
vi.mock('@/lib/external-apis/abn-lookup', () => ({
  lookupAbn: mockLookupAbn,
}));

const mockIsValidAbn = vi.fn();
vi.mock('@/lib/external-apis/abn-validation', () => ({
  isValidAbn: mockIsValidAbn,
}));

const mockSearchCompany = vi.fn();
vi.mock('@/lib/external-apis/brave-search', () => ({
  searchCompany: mockSearchCompany,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost:3001/api/lookup/abn${params}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsValidAbn.mockReturnValue(true);
  mockSearchCompany.mockResolvedValue({});
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/lookup/abn', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns 400 when abn param is missing', async () => {
    const GET = await getHandler();
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid ABN');
  });

  it('returns 400 when ABN is invalid', async () => {
    mockIsValidAbn.mockReturnValue(false);
    const GET = await getHandler();
    const response = await GET(makeGetRequest('?abn=123'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid ABN');
  });

  it('returns 404 when lookupAbn returns null', async () => {
    mockLookupAbn.mockResolvedValue(null);
    const GET = await getHandler();
    const response = await GET(makeGetRequest('?abn=51824753556'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('ABN not found');
  });

  it('returns enriched result with website and description from Brave', async () => {
    mockLookupAbn.mockResolvedValue({
      source: 'abn',
      companyName: 'Acme Pty Ltd',
      abn: '51824753556',
    });
    mockSearchCompany.mockResolvedValue({
      website: 'https://acme.com.au',
      description: 'Leading widget manufacturer',
    });

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?abn=51824753556'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.companyName).toBe('Acme Pty Ltd');
    expect(body.website).toBe('https://acme.com.au');
    expect(body.description).toBe('Leading widget manufacturer');
    expect(mockSearchCompany).toHaveBeenCalledWith('Acme Pty Ltd');
  });

  it('returns result without enrichment if searchCompany returns empty', async () => {
    mockLookupAbn.mockResolvedValue({
      source: 'abn',
      companyName: 'Acme Pty Ltd',
      abn: '51824753556',
    });
    mockSearchCompany.mockResolvedValue({});

    const GET = await getHandler();
    const response = await GET(makeGetRequest('?abn=51824753556'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.companyName).toBe('Acme Pty Ltd');
    expect(body.website).toBeUndefined();
    expect(body.description).toBeUndefined();
  });

  it('strips spaces from ABN before validation', async () => {
    mockLookupAbn.mockResolvedValue({
      source: 'abn',
      companyName: 'Test Co',
      abn: '51824753556',
    });

    const GET = await getHandler();
    await GET(makeGetRequest('?abn=51%20824%20753%20556'));
    expect(mockIsValidAbn).toHaveBeenCalledWith('51824753556');
    expect(mockLookupAbn).toHaveBeenCalledWith('51824753556');
  });
});
