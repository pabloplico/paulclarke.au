import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineTool } from '@/lib/agents/define-tool';
import { db } from '@/lib/db';
import { adminResearchSources } from '@/lib/db/schema';
import { assertPublicUrl } from '@/lib/net/public-url';

const MAX_REDIRECTS = 5;

/**
 * Fetches `url`, following redirects by hand so every hop is checked.
 * Prompt injection: the model picks the URL, so it may only reach public addresses.
 */
async function fetchPublic(url: string, init: RequestInit): Promise<Response> {
  let current = url;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    if (hop === MAX_REDIRECTS) throw new Error(`more than ${MAX_REDIRECTS} redirects`);
    current = new URL(location, current).toString();
  }
}

/**
 * Create a scraper tool that auto-saves discovered URLs as sources.
 * userId/workspaceId baked in via closure for security.
 */
export function createScraperTool(ctx?: { userId: number; workspaceId: number }) {
  return defineTool({
    description: 'Fetch a web page and extract its text content (lightweight, no JS rendering)',
    inputSchema: z.object({
      url: z.string().url().describe('URL to scrape'),
    }),
    outputSchema: z.object({
      content: z.string(),
      title: z.string(),
    }),
    execute: async ({ url }) => {
      try {
        const res = await fetchPublic(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MarketResearchBot/1.0; +https://paulclarke.au)',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          return { content: `Failed to fetch: HTTP ${res.status}`, title: '' };
        }

        const html = await res.text();

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch?.[1]?.trim() ?? '';

        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyHtml = bodyMatch?.[1] ?? html;

        const content = bodyHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 10000);

        // Auto-save as a source if context is provided
        if (ctx && content.length > 100) {
          try {
            const domain = new URL(url).hostname;
            // Check if this domain is already a source for this workspace
            const [existing] = await db
              .select({ id: adminResearchSources.id })
              .from(adminResearchSources)
              .where(eq(adminResearchSources.url, url))
              .limit(1);

            if (!existing) {
              await db.insert(adminResearchSources).values({
                userId: ctx.userId,
                workspaceId: ctx.workspaceId,
                name: title || domain,
                sourceType: 'web_scrape',
                url,
                lastCrawledAt: new Date(),
              });
            }
          } catch {
            // Source auto-save is best-effort, don't fail the scrape
          }
        }

        return { content, title };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: `Scrape failed: ${msg}`, title: '' };
      }
    },
  });
}

/** Standalone scraper tool (no auto-source-saving, for use outside agent context) */
export const scraperTool = createScraperTool();
