import { generateObject } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getModel } from '@/lib/ai/models';
import { enforceBudget, estimateTokens } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';
import type { EnrichedMetadata } from '@/lib/document-processing/metadata';
import type { RoutingSuggestion, WorkspaceMapEntry } from './types';

/**
 * Builds a lightweight map of all workspaces and their sections
 * with content previews for the AI routing prompt.
 */
export async function buildWorkspaceMap(userId?: number): Promise<WorkspaceMapEntry[]> {
  const cfg = await loadConfig();
  const query = db.select().from(adminWorkspaces).orderBy(adminWorkspaces.sortOrder);
  const workspaces = userId ? await query.where(eq(adminWorkspaces.userId, userId)) : await query;

  const entries: WorkspaceMapEntry[] = [];

  for (const ws of workspaces) {
    const sections = await db
      .select()
      .from(adminWorkspaceSections)
      .where(eq(adminWorkspaceSections.workspaceId, ws.id))
      .orderBy(adminWorkspaceSections.sortOrder);

    const sectionEntries = await Promise.all(
      sections.map(async (sec) => {
        // Get latest version content preview
        const [latest] = await db
          .select({ content: adminSectionVersions.content })
          .from(adminSectionVersions)
          .where(eq(adminSectionVersions.sectionId, sec.id))
          .orderBy(desc(adminSectionVersions.version))
          .limit(1);

        const contentPreview = (latest?.content ?? '').slice(
          0,
          cfg.contextLimits.routingSectionPreview
        );

        return {
          sectionId: sec.id,
          sectionTitle: sec.title,
          sectionDescription: sec.description,
          template: sec.template,
          contentPreview,
        };
      })
    );

    entries.push({
      workspaceId: ws.id,
      workspaceTitle: ws.title,
      workspaceDescription: ws.description,
      sections: sectionEntries,
    });
  }

  return entries;
}

const routingSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      workspaceId: z.number().describe('ID of the target workspace'),
      sectionId: z.number().describe('ID of the target section within the workspace'),
      confidence: z.number().min(0).max(1).describe('Confidence score 0-1 for this routing'),
      action: z
        .enum(['append', 'replace', 'new_section'])
        .describe('Whether to append to existing content, replace it, or suggest a new section'),
      suggestedContent: z
        .string()
        .describe('The content to add or replace, formatted as markdown.'),
      reasoning: z
        .string()
        .describe('Brief explanation of why this material belongs in this section'),
      chunkRefs: z.array(z.number()).describe('Source chunk indices referenced by this suggestion'),
    })
  ),
});

/**
 * Routes material to workspace sections using AI.
 * When enrichedMetadata is available, uses the cited summary and entity context
 * instead of truncated raw content for better routing accuracy.
 */
export async function routeMaterial(
  materialTitle: string,
  materialContent: string,
  workspaceMap: WorkspaceMapEntry[],
  enrichedMetadata?: EnrichedMetadata
): Promise<RoutingSuggestion[]> {
  const cfg = await loadConfig();

  // Build workspace map description, dynamically reducing previews if too large
  function buildMapDescription(map: WorkspaceMapEntry[], maxPreviewChars?: number): string {
    return map
      .map((ws) => {
        const sections = ws.sections
          .map((s) => {
            const preview =
              maxPreviewChars != null
                ? (s.contentPreview ?? '').slice(0, maxPreviewChars)
                : s.contentPreview;
            return `    - [id=${s.sectionId}] "${s.sectionTitle}" (${s.template}) — ${s.sectionDescription || 'No description'}${preview ? `\n      Current content preview: ${preview}...` : ''}`;
          })
          .join('\n');
        return `  Workspace [id=${ws.workspaceId}] "${ws.workspaceTitle}" — ${ws.workspaceDescription || 'No description'}\n${sections}`;
      })
      .join('\n\n');
  }

  let mapDescription = buildMapDescription(workspaceMap);

  // If workspace map alone exceeds 50% of routing budget, reduce previews
  const mapTokens = estimateTokens(mapDescription, cfg.ai.model);
  const routingBudget = 8_000;
  if (mapTokens > routingBudget * 0.5) {
    const halfPreview = Math.max(50, Math.floor(cfg.contextLimits.routingSectionPreview / 2));
    mapDescription = buildMapDescription(workspaceMap, halfPreview);
  }

  // When enriched metadata is available, use the cited summary + context instead of raw content
  let materialSection: string;
  if (enrichedMetadata) {
    const entityList = enrichedMetadata.entities
      .map((e) => `${e.name} (${e.type}, chunks: ${e.chunkRefs.join(', ')})`)
      .join('\n  ');
    const decisionList = enrichedMetadata.keyDecisions
      .map((d) => `${d.decision} (chunks: ${d.chunkRefs.join(', ')}, confidence: ${d.confidence})`)
      .join('\n  ');
    const actionList = enrichedMetadata.actionItems
      .map((a) => `${a.item} (chunks: ${a.chunkRefs.join(', ')}, confidence: ${a.confidence})`)
      .join('\n  ');

    materialSection = `Title: ${materialTitle}
Type: ${enrichedMetadata.documentType}
Tags: ${enrichedMetadata.tags.join(', ')}

Summary (with source citations):
${enrichedMetadata.summary}

Entities:
  ${entityList || '(none)'}

Key Decisions:
  ${decisionList || '(none)'}

Action Items:
  ${actionList || '(none)'}`;
  } else {
    // Fallback: token-aware truncation of raw content
    const budgetResult = enforceBudget(
      materialContent,
      { maxInputTokens: 4000, reserveOutputTokens: 0, strategy: 'truncate' },
      cfg.ai.model
    );
    materialSection = `Title: ${materialTitle}
Content:
${budgetResult.text}`;
  }

  const citationInstruction = enrichedMetadata
    ? '\n- Include the chunkRefs array listing chunk indices referenced by each suggestion.'
    : '';

  const startTime = Date.now();
  const { object, usage } = await generateObject({
    model: getModel(cfg),
    schema: routingSuggestionSchema,
    prompt: `You are a knowledge management routing system. Given incoming material and a map of existing workspaces with their sections, determine where this material should be routed.

## Workspace Map
${mapDescription}

## Incoming Material
${materialSection}

## Instructions
- Suggest all sections where this material is relevant, ordered by confidence (highest first)
- For each suggestion, provide the content formatted appropriately for that section
- Use "append" if the material adds to existing content, "replace" if it should update/replace thin content
- Only suggest "new_section" if the material doesn't fit any existing section
- Set confidence based on how clearly the material fits (>0.7 = strong fit, 0.4-0.7 = moderate, <0.4 = weak)
- Only include suggestions with confidence > 0.3
- Format suggestedContent as markdown, matching the section's template style${citationInstruction}`,
  });

  logAIUsage({
    stage: 'routing',
    model: cfg.ai.model,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    latencyMs: Date.now() - startTime,
  });

  // Enrich with workspace/section titles. The model sometimes pairs a
  // workspace with another workspace's section, or makes ids up; those
  // suggestions can't be approved, so drop them. A new_section suggestion
  // names no existing section, so it only needs a real workspace.
  return object.suggestions.flatMap((s) => {
    const ws = workspaceMap.find((w) => w.workspaceId === s.workspaceId);
    const sec = ws?.sections.find((sec) => sec.sectionId === s.sectionId);
    if (!ws || (!sec && s.action !== 'new_section')) return [];
    return [
      {
        ...s,
        workspaceTitle: ws.workspaceTitle,
        sectionTitle: sec?.sectionTitle ?? 'Unknown',
      },
    ];
  });
}
