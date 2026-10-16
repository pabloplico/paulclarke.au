import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineTool } from '@/lib/agents/define-tool';
import { db } from '@/lib/db';
import { adminResearchSources } from '@/lib/db/schema';

/**
 * Create a source-scorer tool that can only touch the given user's sources in
 * the given workspace, baked in like save-finding's.
 * compositeScore is a generated column computed by PostgreSQL.
 */
export function createSourceScorerTool(context: { userId: number; workspaceId: number }) {
  // Prompt injection: the model picks sourceId, so only this workspace's own sources match
  const ownSource = (sourceId: number) =>
    and(
      eq(adminResearchSources.id, sourceId),
      eq(adminResearchSources.userId, context.userId),
      eq(adminResearchSources.workspaceId, context.workspaceId)
    );

  return defineTool({
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
      const [source] = await db.select().from(adminResearchSources).where(ownSource(sourceId));
      if (!source) throw new Error(`Source ${sourceId} not found`);

      await db
        .update(adminResearchSources)
        .set({
          qualityScore,
          reliabilityScore,
          lastCrawledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(ownSource(sourceId));

      const compositeScore =
        qualityScore * 0.4 + reliabilityScore * 0.35 + (source.authorityScore ?? 0.5) * 0.25;
      return { sourceId, compositeScore };
    },
  });
}
