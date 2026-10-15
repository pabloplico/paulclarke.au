import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/document-processing/url-fetcher', () => ({
  fetchUrlContent: vi.fn(),
}));

// Do NOT mock ./rss-parser — it is pure and fast; exercising the integration
// between fetcher and parser is intentional.

// ── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

const MINIMAL_RSS_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Hello World</title>
      <link>https://example.com/hello</link>
      <guid>https://example.com/hello</guid>
      <description>Hello body</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

function makeFeed(
  overrides: Partial<{
    id: number;
    userId: number;
    url: string;
    type: 'rss' | 'page';
    workspaceId: number | null;
    lastFetchedAt: Date | null;
    lastContentHash: string | null;
  }> = {}
) {
  return {
    id: 1,
    userId: 1,
    url: 'https://feeds.example.com/rss',
    type: 'rss' as const,
    workspaceId: null,
    lastFetchedAt: null,
    lastContentHash: null,
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('fetchFeed', () => {
  // ── TC-008-FETCHER-01 — RSS feed: fetches XML, parses items, returns SHA-256 hash ──

  it('TC-008-FETCHER-01: RSS feed fetches XML, parses items, returns SHA-256 hash', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(MINIMAL_RSS_XML),
    } as Response);

    const { fetchFeed } = await import('./fetcher');
    const feed = makeFeed({ type: 'rss', url: 'https://feeds.example.com/rss' });

    const result = await fetchFeed(feed);

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fetch).toHaveBeenCalledWith(
      'https://feeds.example.com/rss',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          Accept: expect.any(String),
        }),
      })
    );
  });

  // ── TC-008-FETCHER-02 — RSS fetch non-ok response throws ─────────────────

  it('TC-008-FETCHER-02: RSS fetch non-ok response throws with status info', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    const { fetchFeed } = await import('./fetcher');
    const feed = makeFeed({ type: 'rss' });

    await expect(fetchFeed(feed)).rejects.toThrow(/404.*Not Found|Not Found.*404/);
  });

  // ── TC-008-FETCHER-03 — Page feed: changed content returns one synthetic item ──

  it('TC-008-FETCHER-03: page feed with changed content returns one synthetic item', async () => {
    const { fetchUrlContent } = await import('@/lib/document-processing/url-fetcher');
    vi.mocked(fetchUrlContent).mockResolvedValueOnce({
      text: 'New page content',
      title: 'My Page',
    });

    const { fetchFeed } = await import('./fetcher');
    const feed = makeFeed({
      type: 'page',
      url: 'https://example.com/page',
      lastContentHash: 'old-hash',
    });

    const result = await fetchFeed(feed);

    expect(result.items.length).toBe(1);
    expect(result.items[0]!.title).toBe('My Page');
    expect(result.items[0]!.content).toBe('New page content');
    expect(result.items[0]!.guid).toMatch(/^page-/);
    expect(result.items[0]!.link).toBe('https://example.com/page');
    expect(result.items[0]!.pubDate).toBeInstanceOf(Date);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── TC-008-FETCHER-04 — Page feed: unchanged content returns empty items ──

  it('TC-008-FETCHER-04: page feed with unchanged content returns empty items', async () => {
    const { fetchUrlContent } = await import('@/lib/document-processing/url-fetcher');
    const sameContent = 'Same content';
    vi.mocked(fetchUrlContent).mockResolvedValueOnce({ text: sameContent, title: 'Page' });

    const { fetchFeed } = await import('./fetcher');
    const existingHash = sha256(sameContent);
    const feed = makeFeed({
      type: 'page',
      lastContentHash: existingHash,
    });

    const result = await fetchFeed(feed);

    expect(result.items.length).toBe(0);
    expect(result.contentHash).toBe(existingHash);
  });

  // ── TC-008-FETCHER-05 — Page feed with no title falls back to feed URL ───

  it('TC-008-FETCHER-05: page feed with null title falls back to feed URL', async () => {
    const { fetchUrlContent } = await import('@/lib/document-processing/url-fetcher');
    vi.mocked(fetchUrlContent).mockResolvedValueOnce({
      text: 'content',
      title: null as unknown as string,
    });

    const { fetchFeed } = await import('./fetcher');
    const feed = makeFeed({
      type: 'page',
      url: 'https://example.com',
      lastContentHash: null,
    });

    const result = await fetchFeed(feed);

    expect(result.items[0]!.title).toBe('https://example.com');
  });
});
