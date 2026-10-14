import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai/models';
import { AU_ENGLISH } from '@/lib/ai/style';
import { enforceBudget } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import type { AppConfig } from '@/lib/config';
import { loadConfig } from '@/lib/config.server';
import type { ChunkAnalysis } from './chunk-analysis';

// ── Basic metadata (original, kept as fallback) ─────────────────────────────

const metadataSchema = z.object({
  summary: z.string().describe('2-3 sentence summary of the document'),
  suggestedTitle: z.string().describe('Concise document title'),
  tags: z.array(z.string()).describe('3-8 relevant tags for categorization'),
  language: z.string().describe('ISO 639-1 language code (e.g. en, es, fr)'),
  documentType: z
    .enum([
      'invoice',
      'contract',
      'procedure',
      'policy',
      'research',
      'report',
      'manual',
      'correspondence',
      'proposal',
      'other',
    ])
    .describe('Document classification'),
});

export type DocumentMetadata = z.infer<typeof metadataSchema>;

/**
 * Basic single-pass metadata extraction (fallback).
 */
export async function extractMetadata(text: string): Promise<DocumentMetadata> {
  const cfg = await loadConfig();
  const budgetResult = enforceBudget(
    text,
    { maxInputTokens: 3000, reserveOutputTokens: 500, strategy: 'truncate' },
    cfg.ai.model
  );

  const startTime = Date.now();
  const { object, usage } = await generateObject({
    model: getModel(cfg),
    schema: metadataSchema,
    system: AU_ENGLISH,
    prompt: `Analyze the following document text and extract metadata.\n\n${budgetResult.text}`,
  });

  logAIUsage({
    stage: 'metadata-extraction',
    model: cfg.ai.model,
    inputTokens: usage?.inputTokens ?? budgetResult.finalTokens,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    latencyMs: Date.now() - startTime,
    truncated: budgetResult.truncated,
  });

  return object;
}

// ── Enriched metadata (multi-step with citations) ───────────────────────────

const DOCUMENT_TYPES = [
  'invoice',
  'contract',
  'procedure',
  'policy',
  'research',
  'report',
  'manual',
  'correspondence',
  'proposal',
  'other',
] as const;

const enrichedMetadataSchema = z.object({
  summary: z
    .string()
    .describe('Summary with inline [chunk N] citations referencing source chunks. 3-5 sentences.'),
  suggestedTitle: z.string().describe('Concise document title'),
  tags: z.array(z.string()).describe('3-8 relevant tags'),
  language: z.string().describe('ISO 639-1 language code'),
  documentType: z.enum(DOCUMENT_TYPES).describe('Document classification'),
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['person', 'organization', 'date', 'location', 'other']),
      chunkRefs: z.array(z.number()).describe('Chunk indices where this entity appears'),
    })
  ),
  keyDecisions: z.array(
    z.object({
      decision: z.string(),
      chunkRefs: z.array(z.number()),
      confidence: z.number().min(0).max(1),
    })
  ),
  actionItems: z.array(
    z.object({
      item: z.string(),
      chunkRefs: z.array(z.number()),
      confidence: z.number().min(0).max(1),
    })
  ),
  fieldConfidence: z.object({
    summary: z.number().min(0).max(1),
    title: z.number().min(0).max(1),
    tags: z.number().min(0).max(1),
    documentType: z.number().min(0).max(1),
  }),
});

export type EnrichedMetadata = z.infer<typeof enrichedMetadataSchema>;

/**
 * Synthesize enriched metadata from per-chunk analysis results.
 * Produces a cited summary, merged entities, decisions, and action items.
 */
export async function extractEnrichedMetadata(
  chunkAnalyses: { chunkIndex: number; analysis: ChunkAnalysis }[],
  documentPreview: string,
  cfg: AppConfig
): Promise<EnrichedMetadata> {
  // Build a compact representation of per-chunk findings for the synthesis prompt
  const analysisText = chunkAnalyses
    .map(({ chunkIndex, analysis }) => {
      const claims = analysis.claims
        .map((c) => `  - [${c.type}] ${c.text} (confidence: ${c.confidence})`)
        .join('\n');
      const entities = analysis.entities.map((e) => `${e.name} (${e.type})`).join(', ');
      const keywords = analysis.topicKeywords.join(', ');
      return `CHUNK ${chunkIndex}:\n  Claims:\n${claims || '  (none)'}\n  Entities: ${entities || '(none)'}\n  Keywords: ${keywords}`;
    })
    .join('\n\n');

  const previewBudget = enforceBudget(
    documentPreview,
    { maxInputTokens: 400, reserveOutputTokens: 0, strategy: 'truncate' },
    cfg.ai.model
  );

  const startTime = Date.now();
  const { object, usage } = await generateObject({
    model: getModel(cfg),
    schema: enrichedMetadataSchema,
    system: AU_ENGLISH,
    prompt: `You are synthesizing metadata for a document based on per-chunk analysis results.

DOCUMENT PREVIEW:
${previewBudget.text}

PER-CHUNK ANALYSIS:
${analysisText}

Instructions:
- Write a summary that references source chunks using [chunk N] notation (e.g., "The report covers market trends [chunk 0] and regulatory changes [chunk 3]")
- Merge entities across chunks, listing all chunk indices where each entity appears
- Consolidate key decisions and action items with their source chunk references
- Provide confidence scores (0-1) for each top-level field based on how well-supported it is by the chunk analyses
- Use the document preview to inform the title and language detection`,
  });

  logAIUsage({
    stage: 'enriched-metadata',
    model: cfg.ai.model,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    latencyMs: Date.now() - startTime,
  });

  return object;
}
