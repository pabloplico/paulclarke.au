import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai/models';
import type { PipelineTokenTracker } from '@/lib/ai/usage-logger';
import type { AppConfig } from '@/lib/config';

const chunkAnalysisSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().describe('A key claim, fact, or statement from the text'),
      type: z.enum(['fact', 'opinion', 'decision', 'action_item']),
      confidence: z.number().min(0).max(1).describe('How confident this claim is supported'),
    })
  ),
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['person', 'organization', 'date', 'location', 'other']),
    })
  ),
  topicKeywords: z.array(z.string()).describe('3-5 keywords summarizing the chunk topic'),
});

export type ChunkAnalysis = z.infer<typeof chunkAnalysisSchema>;

/**
 * Analyze a single chunk, extracting claims, entities, and keywords.
 */
export async function analyzeChunk(
  content: string,
  chunkIndex: number,
  cfg: AppConfig
): Promise<ChunkAnalysis> {
  const { object } = await generateObject({
    model: getModel(cfg),
    schema: chunkAnalysisSchema,
    prompt: `Analyze this text chunk (chunk ${chunkIndex}) and extract key claims, named entities, and topic keywords. Be precise and factual — only extract what is explicitly stated.\n\n${content}`,
  });
  return object;
}

/**
 * Analyze multiple chunks in a single AI call (for small documents).
 */
export async function analyzeChunksBatch(
  chunks: { content: string; index: number }[],
  cfg: AppConfig
): Promise<Map<number, ChunkAnalysis>> {
  const batchSchema = z.object({
    chunks: z.array(
      z.object({
        chunkIndex: z.number(),
        analysis: chunkAnalysisSchema,
      })
    ),
  });

  const chunksText = chunks.map((c) => `--- CHUNK ${c.index} ---\n${c.content}`).join('\n\n');

  const { object } = await generateObject({
    model: getModel(cfg),
    schema: batchSchema,
    prompt: `Analyze each text chunk below. For each chunk, extract key claims, named entities, and topic keywords. Be precise — only extract what is explicitly stated.\n\n${chunksText}`,
  });

  const result = new Map<number, ChunkAnalysis>();
  for (const entry of object.chunks) {
    result.set(entry.chunkIndex, entry.analysis);
  }
  return result;
}

export type ChunkAnalysisResult = {
  analyses: Map<number, ChunkAnalysis>;
  droppedChunks: number;
  totalChunks: number;
};

/**
 * Run per-chunk analysis across all chunks in a document.
 * Uses a single batch call for small documents, parallel calls for larger ones.
 * Returns metadata about dropped chunks when the limit is exceeded.
 */
export async function analyzeAllChunks(
  chunks: { content: string; index: number }[],
  cfg: AppConfig,
  tracker?: PipelineTokenTracker
): Promise<ChunkAnalysisResult> {
  const maxChunks = cfg.extraction?.chunkAnalysisMaxChunks ?? 50;
  const concurrency = cfg.extraction?.chunkAnalysisConcurrency ?? 3;
  const singleCallThreshold = cfg.extraction?.singleCallThreshold ?? 4;

  const totalChunks = chunks.length;
  const droppedChunks = Math.max(0, totalChunks - maxChunks);

  // Cap chunks to analyze
  const toAnalyze = chunks.slice(0, maxChunks);

  if (droppedChunks > 0) {
    console.warn(
      `[chunk-analysis] Dropping ${droppedChunks} of ${totalChunks} chunks (max: ${maxChunks})`
    );
    tracker?.record({
      stage: 'chunk-analysis-drop',
      model: cfg.ai.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      droppedChunks,
    });
  }

  let analyses: Map<number, ChunkAnalysis>;

  // Small documents: single batch call
  if (toAnalyze.length <= singleCallThreshold) {
    analyses = await analyzeChunksBatch(toAnalyze, cfg);
  } else {
    // Larger documents: parallel per-chunk calls with concurrency limit
    analyses = new Map<number, ChunkAnalysis>();
    for (let i = 0; i < toAnalyze.length; i += concurrency) {
      const batch = toAnalyze.slice(i, i + concurrency);
      // Pair each result with its chunk index so no positional lookup is needed
      const results = await Promise.all(
        batch.map(
          async (chunk) =>
            [chunk.index, await analyzeChunk(chunk.content, chunk.index, cfg)] as const
        )
      );
      for (const [index, analysis] of results) {
        analyses.set(index, analysis);
      }
    }
  }

  return { analyses, droppedChunks, totalChunks };
}
