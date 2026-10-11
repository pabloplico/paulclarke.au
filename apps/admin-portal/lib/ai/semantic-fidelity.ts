import { db } from '@/lib/db';
import { generateEmbedding } from '@/lib/rag/embeddings';

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Per-operation thresholds for semantic fidelity.
 * passThreshold: above this similarity = passed
 * flagThreshold: above this but below pass = flagged; below this = rejected
 */
export const FIDELITY_THRESHOLDS: Record<string, { passThreshold: number; flagThreshold: number }> =
  {
    rewrite: { passThreshold: 0.78, flagThreshold: 0.6 },
    simplify: { passThreshold: 0.75, flagThreshold: 0.55 },
    expand: { passThreshold: 0.55, flagThreshold: 0.35 },
    research: { passThreshold: 0.5, flagThreshold: 0.3 },
    custom: { passThreshold: 0.6, flagThreshold: 0.4 },
    gap_fix: { passThreshold: 0.5, flagThreshold: 0.3 },
    route_suggestion: { passThreshold: 0.55, flagThreshold: 0.35 },
    metadata_summary: { passThreshold: 0.6, flagThreshold: 0.4 },
  };

export type FidelityStatus = 'passed' | 'flagged' | 'rejected';

export type FidelityResult = {
  similarity: number;
  status: FidelityStatus;
  sourceEmbedding: number[];
  outputEmbedding: number[];
};

/**
 * Determine fidelity status based on similarity and operation thresholds.
 */
export function determineFidelityStatus(similarity: number, operationType: string): FidelityStatus {
  const thresholds = FIDELITY_THRESHOLDS[operationType] ?? FIDELITY_THRESHOLDS.custom!;
  if (similarity >= thresholds.passThreshold) return 'passed';
  if (similarity >= thresholds.flagThreshold) return 'flagged';
  return 'rejected';
}

/**
 * Check semantic fidelity between source text and AI-generated output.
 * Embeds both texts and computes cosine similarity.
 */
export async function checkFidelity(
  sourceText: string,
  outputText: string,
  operationType: string
): Promise<FidelityResult> {
  // Skip for very short texts (embeddings are unreliable)
  if (!sourceText.trim() || !outputText.trim()) {
    return {
      similarity: 1,
      status: 'passed',
      sourceEmbedding: [],
      outputEmbedding: [],
    };
  }

  // Truncate to embedding model limit (~8000 tokens ≈ 30K chars)
  const maxChars = 30_000;
  const truncSource = sourceText.slice(0, maxChars);
  const truncOutput = outputText.slice(0, maxChars);

  const [sourceEmbedding, outputEmbedding] = await Promise.all([
    generateEmbedding(truncSource),
    generateEmbedding(truncOutput),
  ]);

  const similarity = cosineSimilarity(sourceEmbedding, outputEmbedding);
  const status = determineFidelityStatus(similarity, operationType);

  return { similarity, status, sourceEmbedding, outputEmbedding };
}

export type ProvenanceRecord = {
  operationType: string;
  sourceTextPreview: string;
  outputTextPreview: string;
  cosineSimilarity: number;
  status: FidelityStatus;
  sectionId?: number;
  actionPrompt?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Record a provenance entry in the admin_ai_provenance table.
 * Returns the provenance ID for linking to section versions.
 */
export async function recordProvenance(
  record: ProvenanceRecord & {
    userId?: number;
    sourceEmbedding: number[];
    outputEmbedding: number[];
  }
): Promise<number | null> {
  try {
    // Dynamic import to avoid circular deps and allow this module to work
    // even if the provenance table doesn't exist yet
    const { adminAiProvenance } = await import('@/lib/db/schema');
    if (!adminAiProvenance) return null;

    const [row] = await db
      .insert(adminAiProvenance)
      .values({
        userId: record.userId ?? null,
        operationType: record.operationType,
        sourceText: record.sourceTextPreview,
        outputText: record.outputTextPreview,
        sourceEmbedding: record.sourceEmbedding,
        outputEmbedding: record.outputEmbedding,
        cosineSimilarity: record.cosineSimilarity,
        status: record.status,
        sectionId: record.sectionId ?? null,
        actionPrompt: record.actionPrompt ?? null,
        metadata: record.metadata ?? null,
      })
      .returning({ id: adminAiProvenance.id });

    return row?.id ?? null;
  } catch {
    // Table may not exist yet; log and continue
    console.warn('[semantic-fidelity] Could not record provenance — table may not exist');
    return null;
  }
}
