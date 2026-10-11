import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const origEnv = { ...process.env };

function mockFetch(body: object, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  process.env.GOOGLE_API_KEY = 'test-google-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...origEnv };
});

// ── searchPlaces ────────────────────────────────────────────────────────────

describe('searchPlaces', () => {
  async function getModule() {
    vi.resetModules();
    return import('./google-places');
  }

  it('returns empty array when GOOGLE_API_KEY is missing', async () => {
    delete process.env.GOOGLE_API_KEY;
    const { searchPlaces } = await getModule();
    const result = await searchPlaces('test');
    expect(result).toEqual([]);
  });

  it('parses autocomplete response into CompanySuggestion[]', async () => {
    mockFetch({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ1',
            text: { text: 'Acme Pty Ltd, Sydney NSW' },
            structuredFormat: {
              mainText: { text: 'Acme Pty Ltd' },
              secondaryText: { text: 'Sydney NSW' },
            },
          },
        },
        {
          placePrediction: {
            placeId: 'ChIJ2',
            text: { text: 'Acme Corp, Melbourne VIC' },
            structuredFormat: {
              mainText: { text: 'Acme Corp' },
              secondaryText: { text: 'Melbourne VIC' },
            },
          },
        },
      ],
    });
    const { searchPlaces } = await getModule();

    const results = await searchPlaces('Acme');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      source: 'places',
      companyName: 'Acme Pty Ltd',
      address: 'Sydney NSW',
      placeId: 'ChIJ1',
    });
  });

  it('falls back to text.text when structuredFormat is missing', async () => {
    mockFetch({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ3',
            text: { text: 'Some Business, Brisbane' },
          },
        },
      ],
    });
    const { searchPlaces } = await getModule();
    const results = await searchPlaces('Some');
    expect(results[0]?.companyName).toBe('Some Business, Brisbane');
    expect(results[0]?.address).toBeUndefined();
  });

  it('returns empty array when fetch fails', async () => {
    mockFetch({}, false);
    const { searchPlaces } = await getModule();
    const result = await searchPlaces('test');
    expect(result).toEqual([]);
  });

  it('returns empty array when no suggestions', async () => {
    mockFetch({ suggestions: [] });
    const { searchPlaces } = await getModule();
    const result = await searchPlaces('test');
    expect(result).toEqual([]);
  });

  it('sends correct request body with establishment type', async () => {
    const spy = mockFetch({ suggestions: [] });
    const { searchPlaces } = await getModule();
    await searchPlaces('Acme');

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('places:autocomplete'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          input: 'Acme',
          includedRegionCodes: ['au'],
          includedPrimaryTypes: ['establishment'],
        }),
      })
    );
  });

  it('filters out suggestions without placePrediction', async () => {
    mockFetch({
      suggestions: [
        { placePrediction: { placeId: 'ChIJ1', text: { text: 'Valid' } } },
        { queryPrediction: { text: 'Just a query' } },
      ],
    });
    const { searchPlaces } = await getModule();
    const results = await searchPlaces('test');
    expect(results).toHaveLength(1);
  });
});

// ── searchAddresses ─────────────────────────────────────────────────────────

describe('searchAddresses', () => {
  async function getModule() {
    vi.resetModules();
    return import('./google-places');
  }

  it('returns empty array when GOOGLE_API_KEY is missing', async () => {
    delete process.env.GOOGLE_API_KEY;
    const { searchAddresses } = await getModule();
    const result = await searchAddresses('123 Main St');
    expect(result).toEqual([]);
  });

  it('parses autocomplete response into AddressPrediction[]', async () => {
    mockFetch({
      suggestions: [
        {
          placePrediction: {
            placeId: 'addr1',
            text: { text: '123 Pitt St, Sydney NSW 2000' },
          },
        },
        {
          placePrediction: {
            placeId: 'addr2',
            text: { text: '456 Collins St, Melbourne VIC 3000' },
          },
        },
      ],
    });
    const { searchAddresses } = await getModule();

    const results = await searchAddresses('123');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      placeId: 'addr1',
      description: '123 Pitt St, Sydney NSW 2000',
    });
  });

  it('sends address type in request body', async () => {
    const spy = mockFetch({ suggestions: [] });
    const { searchAddresses } = await getModule();
    await searchAddresses('123 Main');

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('places:autocomplete'),
      expect.objectContaining({
        body: JSON.stringify({
          input: '123 Main',
          includedRegionCodes: ['au'],
          includedPrimaryTypes: ['address'],
        }),
      })
    );
  });

  it('returns empty array when fetch fails', async () => {
    mockFetch({}, false);
    const { searchAddresses } = await getModule();
    const result = await searchAddresses('test');
    expect(result).toEqual([]);
  });
});

// ── getPlaceDetails ─────────────────────────────────────────────────────────

describe('getPlaceDetails', () => {
  async function getModule() {
    vi.resetModules();
    return import('./google-places');
  }

  it('returns null when GOOGLE_API_KEY is missing', async () => {
    delete process.env.GOOGLE_API_KEY;
    const { getPlaceDetails } = await getModule();
    const result = await getPlaceDetails('ChIJ1');
    expect(result).toBeNull();
  });

  it('returns place details', async () => {
    mockFetch({
      displayName: { text: 'Acme Pty Ltd' },
      formattedAddress: '123 Pitt St, Sydney NSW 2000',
      nationalPhoneNumber: '02 1234 5678',
      websiteUri: 'https://acme.com.au',
    });
    const { getPlaceDetails } = await getModule();

    const result = await getPlaceDetails('ChIJ1');
    expect(result).toEqual({
      name: 'Acme Pty Ltd',
      address: '123 Pitt St, Sydney NSW 2000',
      phone: '02 1234 5678',
      website: 'https://acme.com.au',
    });
  });

  it('handles partial details (missing fields)', async () => {
    mockFetch({
      displayName: { text: 'Some Place' },
    });
    const { getPlaceDetails } = await getModule();

    const result = await getPlaceDetails('ChIJ2');
    expect(result).toEqual({
      name: 'Some Place',
      address: undefined,
      phone: undefined,
      website: undefined,
    });
  });

  it('returns null when fetch fails', async () => {
    mockFetch({}, false);
    const { getPlaceDetails } = await getModule();
    const result = await getPlaceDetails('ChIJ1');
    expect(result).toBeNull();
  });

  it('sends correct headers with field mask', async () => {
    const spy = mockFetch({ displayName: { text: 'Test' } });
    const { getPlaceDetails } = await getModule();
    await getPlaceDetails('ChIJ1');

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/places/ChIJ1'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-google-key',
          'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,websiteUri',
        }),
      })
    );
  });
});
