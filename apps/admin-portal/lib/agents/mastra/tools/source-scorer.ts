import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { adminResearchSources } from '@/lib/db/schema';

/**
 * Update quality scores for a data source based on crawl results.
 * compositeScore is a generated column computed by PostgreSQL.
 */
export const sourceScorerTool = createTool({
  id: 'source-scorer',
  description: 'Update quality scores for a data source based on crawl results',
  inputSchema: z.object({
    sourceId: z.number().describe('Source ID to update'),
    qualityScore: z.number().min(0).max(1).describe('Content quality ratio'),
    reliabilityScore: z.number().min(0).max(1).describe('Uptime + response time score'),
  }),
  outputSchema: z.object({
    sourceId: z.number(),
    compositeScore: z.number(),
  }),
  execute: async ({ sourceId, qualityScore, reliabilityScore }) => {
    const [source] = await db
      .select()
      .from(adminResearchSources)
      .where(eq(adminResearchSources.id, sourceId));
    if (!source) throw new Error(`Source ${sourceId} not found`);

    await db
      .update(adminResearchSources)
      .set({
        qualityScore,
        reliabilityScore,
        lastCrawledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adminResearchSources.id, sourceId));

    const compositeScore =
      qualityScore * 0.4 + reliabilityScore * 0.35 + (source.authorityScore ?? 0.5) * 0.25;
    return { sourceId, compositeScore };
  },
});
