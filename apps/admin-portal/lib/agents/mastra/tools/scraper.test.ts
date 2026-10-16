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

beforeAll(async () => {
  await ensurePgliteReady();
}, 30_000);

afterAll(async () => {
  await getPglite().close();
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
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
