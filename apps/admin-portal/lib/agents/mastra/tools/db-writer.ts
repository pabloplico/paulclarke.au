import { createHash } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { db } from '@/lib/db';
import { adminFindings } from '@/lib/db/schema';

/**
 * Create a save-finding tool with userId and workspaceId baked in.
 * This prevents the LLM from supplying arbitrary user/workspace IDs.
 */
export function createDbWriterTool(context: {
  userId: number;
  workspaceId: number;
  agentRunId?: number;
}) {
  return createTool({
    id: 'save-finding',
    description: 'Save a market research finding to the database',
    inputSchema: z.object({
      title: z.string().describe('Short title for the finding'),
      content: z.string().describe('Full content of the finding'),
      findingType: z
        .enum(['trend', 'competitor', 'pricing', 'regulation', 'sentiment', 'statistic', 'news'])
        .describe('Type of finding'),
      confidenceScore: z.number().min(0).max(1).default(0.5),
      sentimentScore: z.number().min(-1).max(1).optional(),
      geo: z
        .object({
          country: z.string().optional(),
          state: z.string().optional(),
          city: z.string().optional(),
        })
        .optional(),
      tags: z
        .object({
          sectors: z.array(z.string()).optional(),
          topics: z.array(z.string()).optional(),
          entities: z.array(z.string()).optional(),
        })
        .optional(),
      url: z.string().url().optional(),
      sourceId: z.number().optional(),
    }),
    outputSchema: z.object({
      findingId: z.number(),
      status: z.string(),
    }),
    execute: async (input) => {
      const contentHash = createHash('md5').update(input.content).digest('hex');

      const [finding] = await db
        .insert(adminFindings)
        .values({
          userId: context.userId,
          workspaceId: context.workspaceId,
          title: input.title,
          content: input.content,
          contentHash,
          findingType: input.findingType,
          confidenceScore: input.confidenceScore,
          sentimentScore: input.sentimentScore,
          geo: input.geo || {},
          tags: input.tags || {},
          url: input.url,
          sourceId: input.sourceId,
          agentRunId: context.agentRunId,
        })
        .onConflictDoUpdate({
          target: [adminFindings.workspaceId, adminFindings.contentHash],
          set: {
            confidenceScore: input.confidenceScore,
            foundAt: new Date(),
          },
        })
        .returning();

      if (!finding) throw new Error('Failed to save finding');

      return { findingId: finding.id, status: 'saved' };
    },
  });
}
