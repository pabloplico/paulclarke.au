import { generateObject } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AU_ENGLISH } from '@/lib/ai/style';
import { db } from '@/lib/db';
import type { SourceType } from '@/lib/db/schema';
import { adminResearchSources } from '@/lib/db/schema';
import { getModel } from './mastra/provider';
import { loadResearchSettings } from './settings';
import { type DirectorySource, SOURCE_DIRECTORY } from './source-directory';

const suggestionSchema = z.object({
  sources: z.array(
    z.object({
      url: z.string().describe('The URL from the source directory'),
      reason: z.string().describe('Brief reason why this source is relevant'),
    })
  ),
});

/**
 * Use AI to suggest the most relevant data sources for a workspace
 * from the curated source directory.
 */
export async function suggestSourcesForWorkspace(
  workspace: {
    title: string;
    category: string | null;
    description: string | null;
    metadata: Record<string, unknown> | null;
    id: number;
    userId: number;
  },
  options?: { freeOnly?: boolean }
): Promise<Array<DirectorySource & { reason: string }>> {
  const settings = await loadResearchSettings(workspace.userId);
  const freeOnly = options?.freeOnly ?? true;

  // Filter directory before building prompt — exclude paid sources by default
  const candidates = freeOnly
    ? SOURCE_DIRECTORY.filter((s) => !s.apiKeyRequired)
    : SOURCE_DIRECTORY;

  // Build a compact directory summary for the prompt
  const directoryText = candidates
    .map(
      (s, i) =>
        `${i + 1}. ${s.name} | ${s.url} | ${s.type} | ${s.category} | ${s.geoFocus} | ${s.bestFor} | key:${s.apiKeyRequired ? 'yes' : 'no'} | ${s.description}`
    )
    .join('\n');

  const industry =
    (workspace.metadata as Record<string, unknown>)?.industry ?? workspace.category ?? 'general';
  const geo = (workspace.metadata as Record<string, unknown>)?.geo as
    | { country?: string; state?: string; city?: string }
    | undefined;
  const geoContext = geo
    ? [geo.country, geo.state, geo.city].filter(Boolean).join(', ')
    : 'not specified';

  const result = await generateObject({
    model: getModel({ provider: settings.aiProvider, model: settings.aiModel }),
    schema: suggestionSchema,
    system: AU_ENGLISH,
    prompt: `You are a market research data source specialist. Given the workspace below, select the 8-12 MOST RELEVANT data sources from the directory. Prioritize:
1. Sources matching the geographic focus (${geoContext})
2. Sources matching the category (${workspace.category || 'general'})
3. Sources relevant to the industry (${industry})
4. Sources that don't require API keys (prefer free/open)
5. A mix of categories (government stats, news, industry reports, etc.)

WORKSPACE:
- Name: ${workspace.title}
- Category: ${workspace.category || 'general'}
- Industry: ${industry}
- Geographic focus: ${geoContext}
- Description: ${workspace.description || 'none'}

SOURCE DIRECTORY:
${directoryText}

Select 8-12 sources by their URL. For each, give a brief reason why it's relevant to this specific workspace.`,
  });

  // Map URLs back to full directory entries
  const urlToSource = new Map(candidates.map((s) => [s.url, s]));
  const suggestions: Array<DirectorySource & { reason: string }> = [];

  for (const item of result.object.sources) {
    const source = urlToSource.get(item.url);
    if (source) {
      suggestions.push({ ...source, reason: item.reason });
    }
  }

  return suggestions;
}

/**
 * Auto-add suggested sources to a workspace's admin_research_sources table.
 * Returns the number of sources added.
 */
export async function autoAddSuggestedSources(
  workspaceId: number,
  userId: number,
  suggestions: Array<DirectorySource & { reason: string }>
): Promise<number> {
  if (suggestions.length === 0) return 0;

  // Fetch existing sources for this workspace to skip duplicates
  const existing = await db
    .select({ url: adminResearchSources.url, name: adminResearchSources.name })
    .from(adminResearchSources)
    .where(eq(adminResearchSources.workspaceId, workspaceId));

  const existingUrls = new Set(existing.map((s) => s.url).filter(Boolean));
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

  const sourceTypeMap: Record<string, SourceType> = {
    api: 'public_api',
    rss: 'web_scrape',
    scrape: 'web_scrape',
  };

  const values = suggestions
    .filter((s) => !existingUrls.has(s.url) && !existingNames.has(s.name.toLowerCase()))
    .map((s) => ({
      userId,
      workspaceId,
      name: s.name,
      sourceType: sourceTypeMap[s.type] ?? ('web_scrape' as SourceType),
      url: s.url,
      config: { reason: s.reason, autoSuggested: true },
    }));

  if (values.length === 0) return 0;

  await db.insert(adminResearchSources).values(values);
  return values.length;
}
