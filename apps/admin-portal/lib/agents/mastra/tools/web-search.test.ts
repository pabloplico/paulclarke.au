import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webSearchTool } from './web-search';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BRAVE_SEARCH_API', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const search = (input: Record<string, unknown>) =>
  webSearchTool.execute?.(input as never, {} as never);

const brave = (results: unknown[], status = 200) =>
  new Response(JSON.stringify({ web: { results } }), { status });

/** A DuckDuckGo HTML results page with one entry per result. */
const duckDuckGo = (results: { url: string; title: string; snippet: string }[]) =>
  new Response(
    `<html><body>${results
      .map(
        (r) =>
          `<div class="result"><a rel="nofollow" class="result__a" href="${r.url}">${r.title}</a>
           <a class="result__snippet" href="${r.url}">${r.snippet}</a></div>`
      )
      .join('\n')}</body></html>`
  );

describe('web-search tool', () => {
  it('uses Brave Search when BRAVE_SEARCH_API is set', async () => {
    vi.stubEnv('BRAVE_SEARCH_API', 'brave-key');
    fetchMock.mockResolvedValue(
      brave([
        { title: 'Best coffee in Cairns', url: 'https://a.example', description: 'A list' },
        { url: 'https://b.example' },
      ])
    );

    const result = await search({ query: 'cairns coffee', maxResults: 5 });

    expect(result).toEqual({
      results: [
        { title: 'Best coffee in Cairns', url: 'https://a.example', snippet: 'A list' },
        { title: '', url: 'https://b.example', snippet: '' },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(url)).searchParams.get('q')).toBe('cairns coffee');
    expect(new URL(String(url)).searchParams.get('count')).toBe('5');
    expect((init!.headers as Record<string, string>)['X-Subscription-Token']).toBe('brave-key');
  });

  it('falls back to DuckDuckGo when Brave answers with an error status', async () => {
    vi.stubEnv('BRAVE_SEARCH_API', 'brave-key');
    fetchMock.mockResolvedValueOnce(brave([], 429)).mockResolvedValueOnce(
      duckDuckGo([
        {
          url: 'https://c.example',
          title: ' Cafe guide ',
          snippet: 'The <b>best</b> flat whites',
        },
      ])
    );

    const result = await search({ query: 'cairns coffee' });

    expect(result).toEqual({
      results: [{ url: 'https://c.example', title: 'Cafe guide', snippet: 'The best flat whites' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).hostname).toBe('html.duckduckgo.com');
  });

  it('goes straight to DuckDuckGo without a Brave key, keeping at most maxResults', async () => {
    fetchMock.mockResolvedValue(
      duckDuckGo(
        ['one', 'two', 'three'].map((n) => ({ url: `https://${n}.example`, title: n, snippet: n }))
      )
    );

    const result = await search({ query: 'coffee', maxResults: 2 });

    expect(result).toEqual({
      results: [
        { url: 'https://one.example', title: 'one', snippet: 'one' },
        { url: 'https://two.example', title: 'two', snippet: 'two' },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns no results when every backend fails', async () => {
    vi.stubEnv('BRAVE_SEARCH_API', 'brave-key');
    fetchMock.mockRejectedValue(new Error('network down'));

    expect(await search({ query: 'coffee' })).toEqual({ results: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
