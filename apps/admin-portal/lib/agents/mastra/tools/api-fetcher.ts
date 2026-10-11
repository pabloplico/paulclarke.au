import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Fetch data from public APIs: GDELT, NewsAPI, World Bank, ABS.
 * Each source has its own fetch logic.
 */
export const apiFetcherTool = createTool({
  id: 'api-fetcher',
  description: 'Fetch data from public APIs (GDELT, NewsAPI, World Bank, ABS)',
  inputSchema: z.object({
    source: z.enum(['gdelt', 'newsapi', 'worldbank', 'abs']).describe('API source to query'),
    query: z.string().describe('Search query or indicator'),
    country: z.string().optional().describe('Country code (e.g. AU, US)'),
  }),
  outputSchema: z.object({
    data: z.array(z.record(z.string(), z.unknown())),
    source: z.string(),
  }),
  execute: async ({ source, query, country }) => {
    try {
      switch (source) {
        case 'gdelt': {
          const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json`;
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) return { data: [], source: 'gdelt' };
          const json = await res.json();
          const articles = json.articles || [];
          return {
            data: articles.map((a: Record<string, unknown>) => ({
              title: a.title,
              url: a.url,
              source: a.domain,
              date: a.seendate,
              language: a.language,
            })),
            source: 'gdelt',
          };
        }
        case 'newsapi': {
          const apiKey = process.env.NEWSAPI_KEY;
          if (!apiKey) return { data: [{ error: 'NEWSAPI_KEY not set' }], source: 'newsapi' };
          const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=10&apiKey=${apiKey}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) return { data: [], source: 'newsapi' };
          const json = await res.json();
          return {
            data: (json.articles || []).map((a: Record<string, unknown>) => ({
              title: a.title,
              url: a.url,
              source: (a.source as Record<string, unknown>)?.name,
              publishedAt: a.publishedAt,
              description: a.description,
            })),
            source: 'newsapi',
          };
        }
        case 'worldbank': {
          const countryCode = country || 'WLD';
          const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${encodeURIComponent(query)}?format=json&per_page=10&date=2020:2025`;
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) return { data: [], source: 'worldbank' };
          const json = await res.json();
          const records = Array.isArray(json) && json[1] ? json[1] : [];
          return {
            data: records.map((r: Record<string, unknown>) => ({
              indicator: (r.indicator as Record<string, unknown>)?.value,
              country: (r.country as Record<string, unknown>)?.value,
              year: r.date,
              value: r.value,
            })),
            source: 'worldbank',
          };
        }
        case 'abs': {
          const url = `https://api.data.abs.gov.au/data/ABS,${encodeURIComponent(query)}/all?detail=dataonly&dimensionAtObservation=AllDimensions&format=jsondata`;
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok)
            return { data: [{ error: `ABS API returned ${res.status}` }], source: 'abs' };
          const json = await res.json();
          return { data: [json], source: 'abs' };
        }
        default:
          return { data: [], source };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { data: [{ error: msg }], source };
    }
  },
});
