import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetcherTool } from './api-fetcher';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchFrom = (input: Record<string, unknown>) =>
  apiFetcherTool.execute?.(input as never, {} as never);

/** The URL of the only fetch made. */
function requestedUrl() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

describe('api-fetcher tool', () => {
  it('maps GDELT articles to title, url, source, date and language', async () => {
    fetchMock.mockResolvedValue(
      json({
        articles: [
          {
            title: 'Cairns tourism rebounds',
            url: 'https://example.com/a',
            domain: 'example.com',
            seendate: '20261015T000000Z',
            language: 'English',
            tone: 1.2,
          },
        ],
      })
    );

    const result = await fetchFrom({ source: 'gdelt', query: 'cairns coffee' });

    expect(result).toEqual({
      source: 'gdelt',
      data: [
        {
          title: 'Cairns tourism rebounds',
          url: 'https://example.com/a',
          source: 'example.com',
          date: '20261015T000000Z',
          language: 'English',
        },
      ],
    });
    const url = requestedUrl();
    expect(url.hostname).toBe('api.gdeltproject.org');
    expect(url.searchParams.get('query')).toBe('cairns coffee');
  });

  it('returns no GDELT data when the API answers with an error status', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    expect(await fetchFrom({ source: 'gdelt', query: 'x' })).toEqual({ data: [], source: 'gdelt' });
  });

  it('says NEWSAPI_KEY is missing without calling NewsAPI', async () => {
    vi.stubEnv('NEWSAPI_KEY', '');

    const result = await fetchFrom({ source: 'newsapi', query: 'coffee' });

    expect(result).toEqual({ data: [{ error: 'NEWSAPI_KEY not set' }], source: 'newsapi' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps NewsAPI articles, sending the key', async () => {
    vi.stubEnv('NEWSAPI_KEY', 'news-key');
    fetchMock.mockResolvedValue(
      json({
        articles: [
          {
            title: 'Coffee prices climb',
            url: 'https://example.com/b',
            source: { id: null, name: 'Example News' },
            publishedAt: '2026-10-15T00:00:00Z',
            description: 'Beans cost more',
          },
        ],
      })
    );

    const result = await fetchFrom({ source: 'newsapi', query: 'coffee' });

    expect(result).toEqual({
      source: 'newsapi',
      data: [
        {
          title: 'Coffee prices climb',
          url: 'https://example.com/b',
          source: 'Example News',
          publishedAt: '2026-10-15T00:00:00Z',
          description: 'Beans cost more',
        },
      ],
    });
    expect(requestedUrl().searchParams.get('apiKey')).toBe('news-key');
  });

  it('reads World Bank records from the second element, for the world unless a country is given', async () => {
    const record = {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'AU', value: 'Australia' },
      date: '2024',
      value: 1.8e12,
    };
    fetchMock.mockResolvedValue(json([{ page: 1 }, [record]]));

    const result = await fetchFrom({ source: 'worldbank', query: 'NY.GDP.MKTP.CD', country: 'AU' });

    expect(result).toEqual({
      source: 'worldbank',
      data: [{ indicator: 'GDP (current US$)', country: 'Australia', year: '2024', value: 1.8e12 }],
    });
    expect(requestedUrl().pathname).toBe('/v2/country/AU/indicator/NY.GDP.MKTP.CD');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json([{ page: 1 }]));
    expect(await fetchFrom({ source: 'worldbank', query: 'NY.GDP.MKTP.CD' })).toEqual({
      data: [],
      source: 'worldbank',
    });
    expect(requestedUrl().pathname).toBe('/v2/country/WLD/indicator/NY.GDP.MKTP.CD');
  });

  it('passes the ABS response through whole, and reports its error status', async () => {
    fetchMock.mockResolvedValue(json({ data: { dataSets: [] } }));
    expect(await fetchFrom({ source: 'abs', query: 'CPI' })).toEqual({
      data: [{ data: { dataSets: [] } }],
      source: 'abs',
    });

    fetchMock.mockResolvedValue(json({}, 404));
    expect(await fetchFrom({ source: 'abs', query: 'CPI' })).toEqual({
      data: [{ error: 'ABS API returned 404' }],
      source: 'abs',
    });
  });

  it('returns a network failure as data instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    expect(await fetchFrom({ source: 'gdelt', query: 'x' })).toEqual({
      data: [{ error: 'getaddrinfo ENOTFOUND' }],
      source: 'gdelt',
    });
  });
});
