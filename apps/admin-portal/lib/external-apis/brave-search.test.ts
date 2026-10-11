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
  process.env.BRAVE_SEARCH_API = 'test-brave-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...origEnv };
});

describe('searchCompany', () => {
  async function getModule() {
    vi.resetModules();
    return import('./brave-search');
  }

  it('returns empty object when BRAVE_SEARCH_API is missing', async () => {
    delete process.env.BRAVE_SEARCH_API;
    const { searchCompany } = await getModule();
    const result = await searchCompany('Acme');
    expect(result).toEqual({});
  });

  it('returns website and description from first non-directory result', async () => {
    mockFetch({
      web: {
        results: [
          {
            url: 'https://www.linkedin.com/company/acme',
            title: 'Acme on LinkedIn',
            description: 'LinkedIn profile',
          },
          {
            url: 'https://acme.com.au',
            title: 'Acme Pty Ltd',
            description: 'Leading provider of widgets',
          },
          { url: 'https://yellowpages.com.au/acme', title: 'Acme YP', description: 'YP listing' },
        ],
      },
    });
    const { searchCompany } = await getModule();

    const result = await searchCompany('Acme');
    expect(result.website).toBe('https://acme.com.au');
    expect(result.description).toBe('Leading provider of widgets');
  });

  it('skips all directory/social sites', async () => {
    const skipDomains = [
      'linkedin.com',
      'facebook.com',
      'twitter.com',
      'instagram.com',
      'yellowpages.com.au',
      'truelocal.com.au',
      'yelp.com',
      'wikipedia.org',
    ];
    mockFetch({
      web: {
        results: skipDomains.map((d) => ({
          url: `https://${d}/company`,
          title: 'Skip',
          description: `Result from ${d}`,
        })),
      },
    });
    const { searchCompany } = await getModule();
    const result = await searchCompany('Test');
    // No website found, but description falls back to first result
    expect(result.website).toBeUndefined();
    expect(result.description).toBe('Result from linkedin.com');
  });

  it('returns empty object when fetch fails', async () => {
    mockFetch({}, false);
    const { searchCompany } = await getModule();
    const result = await searchCompany('Acme');
    expect(result).toEqual({});
  });

  it('returns empty object when no web results', async () => {
    mockFetch({ web: { results: [] } });
    const { searchCompany } = await getModule();
    const result = await searchCompany('Acme');
    expect(result).toEqual({});
  });

  it('returns empty object when web field is missing', async () => {
    mockFetch({});
    const { searchCompany } = await getModule();
    const result = await searchCompany('Acme');
    expect(result).toEqual({});
  });

  it('appends "Australia" to search query', async () => {
    const spy = mockFetch({ web: { results: [] } });
    const { searchCompany } = await getModule();
    await searchCompany('Acme Corp');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('q=Acme%20Corp%20Australia'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'test-brave-key',
        }),
      })
    );
  });

  it('returns first result description when all results are directories', async () => {
    mockFetch({
      web: {
        results: [
          { url: 'https://linkedin.com/acme', title: 'LinkedIn', description: 'Acme on LinkedIn' },
        ],
      },
    });
    const { searchCompany } = await getModule();
    const result = await searchCompany('Acme');
    expect(result.website).toBeUndefined();
    expect(result.description).toBe('Acme on LinkedIn');
  });
});
