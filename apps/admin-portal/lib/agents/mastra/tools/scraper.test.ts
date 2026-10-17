import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { eq } = await import('drizzle-orm');
const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const { adminResearchSources, adminUsers, adminWorkspaces } = await import('@/lib/db/schema');
const { createScraperTool, scraperTool } = await import('./scraper');

const fetchMock = vi.fn<typeof fetch>();

// Every hostname resolves to what the test says; a public address by default
const resolvesTo = vi.hoisted(() => ({ addresses: ['93.184.215.14'] }));
vi.mock('node:dns/promises', () => ({
  lookup: async () =>
    resolvesTo.addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
}));

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  resolvesTo.addresses = ['93.184.215.14'];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let seq = 0;

async function givenWorkspace() {
  seq++;
  const [user] = await db
    .insert(adminUsers)
    .values({ email: `scraper-${seq}@example.com`, passwordHash: 'x', name: 'Scraper' })
    .returning();
  const [workspace] = await db
    .insert(adminWorkspaces)
    .values({ slug: `scraper-${seq}`, title: 'Scraper', userId: user!.id })
    .returning();
  return { userId: user!.id, workspaceId: workspace!.id };
}

const article = 'Cairns has more than forty specialty cafes. '.repeat(5);

const page = `<!doctype html><html><head><title> Cairns Coffee Guide </title>
<style>body { color: red }</style></head>
<body>
  <header>Site header</header>
  <nav><a href="/">Home</a></nav>
  <script>trackVisitor()</script>
  <main><h1>Where to drink coffee</h1><p>${article}</p></main>
  <footer>Copyright</footer>
</body></html>`;

const scrape = (tool: typeof scraperTool, url: string) =>
  tool.execute?.({ url } as never, {} as never);

const sourcesIn = (workspaceId: number) =>
  db.select().from(adminResearchSources).where(eq(adminResearchSources.workspaceId, workspaceId));

describe('scraper tool', () => {
  it('returns the title and the body text, without scripts, styles, navigation, header or footer', async () => {
    fetchMock.mockResolvedValue(new Response(page));

    const result = await scrape(scraperTool, 'https://example.com/guide');

    expect(result).toEqual({
      title: 'Cairns Coffee Guide',
      content: `Where to drink coffee ${article.trim()}`,
    });
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.headers as Record<string, string>)['User-Agent']).toContain('MarketResearchBot');
  });

  it('cuts the text at 10,000 characters', async () => {
    fetchMock.mockResolvedValue(new Response(`<body>${'a'.repeat(20_000)}</body>`));
    const result = (await scrape(scraperTool, 'https://example.com/long')) as { content: string };
    expect(result.content).toHaveLength(10_000);
  });

  it('reports an error status or a network failure as content instead of throwing', async () => {
    fetchMock.mockResolvedValue(new Response('gone', { status: 404 }));
    expect(await scrape(scraperTool, 'https://example.com/a')).toEqual({
      content: 'Failed to fetch: HTTP 404',
      title: '',
    });

    fetchMock.mockRejectedValue(new Error('timeout'));
    expect(await scrape(scraperTool, 'https://example.com/b')).toEqual({
      content: 'Scrape failed: timeout',
      title: '',
    });
  });

  it('saves a page it scraped for a workspace as a source, once', async () => {
    const context = await givenWorkspace();
    const tool = createScraperTool(context);
    fetchMock.mockImplementation(async () => new Response(page));

    await scrape(tool, 'https://example.com/saved-once');
    await scrape(tool, 'https://example.com/saved-once');

    expect(await sourcesIn(context.workspaceId)).toMatchObject([
      {
        userId: context.userId,
        name: 'Cairns Coffee Guide',
        sourceType: 'web_scrape',
        url: 'https://example.com/saved-once',
        lastCrawledAt: expect.any(Date),
      },
    ]);
  });

  it('names the source after the domain when the page has no title', async () => {
    const context = await givenWorkspace();
    fetchMock.mockResolvedValue(new Response(`<body>${article}</body>`));

    await scrape(createScraperTool(context), 'https://cafes.example.com/untitled');

    expect(await sourcesIn(context.workspaceId)).toMatchObject([{ name: 'cafes.example.com' }]);
  });

  it('saves no source for a page with 100 characters of text or fewer', async () => {
    const context = await givenWorkspace();
    fetchMock.mockResolvedValue(new Response('<title>Short</title><body>Too short.</body>'));

    await scrape(createScraperTool(context), 'https://example.com/short');

    expect(await sourcesIn(context.workspaceId)).toEqual([]);
  });
});

describe('scraper tool: only public addresses', () => {
  /** Scrapes `url` and expects it refused without a request. */
  async function expectRefused(url: string, reason: RegExp) {
    fetchMock.mockResolvedValue(new Response(page));
    const result = (await scrape(scraperTool, url)) as { content: string; title: string };
    expect(result.title).toBe('');
    expect(result.content).toMatch(/^Scrape failed: Refused /);
    expect(result.content).toMatch(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  }

  it.each([
    ['ftp://example.com/file.txt', /ftp: is not http or https/],
    ['file:///etc/passwd', /file: is not http or https/],
  ])('refuses a scheme other than http or https: %s', async (url, reason) => {
    await expectRefused(url, reason);
  });

  it.each(['http://localhost:3001/api/settings', 'http://admin.localhost/'])(
    'refuses localhost by name: %s',
    async (url) => {
      await expectRefused(url, /is not public/);
    }
  );

  it.each([
    ['loopback IPv4', 'http://127.0.0.1:5432/'],
    ['loopback IPv6', 'http://[::1]/'],
    ['the unspecified address', 'http://0.0.0.0:3001/'],
    ['private 10/8', 'http://10.0.0.5/'],
    ['private 172.16/12', 'http://172.20.1.1/'],
    ['private 192.168/16', 'http://192.168.0.20/'],
    ['IPv6 unique local', 'http://[fd12:3456::1]/'],
    ['link-local IPv4', 'http://169.254.10.10/'],
    ['link-local IPv6', 'http://[fe80::1]/'],
    ['AWS, GCP and Azure metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['AWS IPv6 metadata', 'http://[fd00:ec2::254]/'],
    ['an IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/'],
  ])('refuses %s as an address literal', async (_name, url) => {
    await expectRefused(url, /is not public/);
  });

  it.each([
    ['loopback', ['127.0.0.2']],
    ['private', ['10.1.2.3']],
    ['link-local', ['169.254.1.1']],
    ['metadata', ['169.254.169.254']],
    ['IPv6 unique local', ['fd00::5']],
    ['a mix of public and private', ['93.184.215.14', '192.168.1.1']],
  ])('refuses a hostname that resolves to %s', async (_name, addresses) => {
    resolvesTo.addresses = addresses;
    await expectRefused('https://innocent.example.com/', /resolves to .* which is not public/);
  });

  it('refuses the GCP metadata hostname by name', async () => {
    await expectRefused('http://metadata.google.internal/computeMetadata/v1/', /is not public/);
  });

  it('refuses a hostname that does not resolve', async () => {
    resolvesTo.addresses = [];
    await expectRefused('https://nowhere.example.com/', /did not resolve/);
  });

  it('checks every redirect, refusing one that leads to an internal address', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
    );

    const result = await scrape(scraperTool, 'https://example.com/redirect');

    expect(result).toEqual({
      content: expect.stringMatching(/^Scrape failed: Refused http:\/\/169\.254\.169\.254/),
      title: '',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a redirect to another public page', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/moved' } }))
      .mockResolvedValueOnce(new Response(page));

    const result = await scrape(scraperTool, 'https://example.com/old');

    expect(result).toMatchObject({ title: 'Cairns Coffee Guide' });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://example.com/moved');
  });
});
