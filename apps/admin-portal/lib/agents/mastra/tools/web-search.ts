import { z } from 'zod';
import { defineTool } from '@/lib/agents/define-tool';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'web-search' });

/**
 * Search the web using Brave Search API (primary) or DuckDuckGo HTML (fallback).
 * Set BRAVE_SEARCH_API in .env.docker to enable Brave Search.
 */
export const webSearchTool = defineTool({
  description: 'Search the web for market research data',
  inputSchema: z.object({
    query: z.string().describe('Search query string'),
    maxResults: z.number().default(10).describe('Max results to return'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })
    ),
  }),
  execute: async ({ query, maxResults }) => {
    const limit = maxResults ?? 10;

    // Try Brave Search API first (structured JSON, reliable)
    if (process.env.BRAVE_SEARCH_API) {
      try {
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
          {
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': process.env.BRAVE_SEARCH_API,
            },
            signal: AbortSignal.timeout(15000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const webResults = data.web?.results ?? [];
          return {
            results: webResults
              .slice(0, limit)
              .map((r: { title?: string; url?: string; description?: string }) => ({
                title: r.title ?? '',
                url: r.url ?? '',
                snippet: r.description ?? '',
              })),
          };
        }
        log.warn('Brave API returned error status', { status: res.status, query });
      } catch (error) {
        log.warn('Brave API request failed, falling back to DuckDuckGo', {
          error: error instanceof Error ? error.message : String(error),
          query,
        });
      }
    }

    // Fallback: DuckDuckGo HTML scraping
    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();

      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultPattern =
        /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

      let match = resultPattern.exec(html);
      while (match !== null && results.length < limit) {
        results.push({
          url: match[1] ?? '',
          title: (match[2] ?? '').trim(),
          snippet: (match[3] ?? '').replace(/<[^>]*>/g, '').trim(),
        });
        match = resultPattern.exec(html);
      }

      return { results };
    } catch (error) {
      log.error('All search backends failed', {
        error: error instanceof Error ? error.message : String(error),
        query,
      });
      return { results: [] };
    }
  },
});
