import type { QualityFlag } from '@/lib/db/schema';
import type { Chunk } from '@/lib/rag/chunker';
import type { EnrichedMetadata } from './metadata';

/**
 * Check cleaning stage quality by comparing raw vs cleaned text.
 */
export function checkCleaningQuality(rawText: string, cleanedText: string): QualityFlag[] {
  const flags: QualityFlag[] = [];

  if (!rawText.length) return flags;

  // Check for excessive content loss
  const ratio = cleanedText.length / rawText.length;
  if (ratio < 0.5) {
    flags.push({
      stage: 'clean',
      severity: ratio < 0.2 ? 'error' : 'warning',
      code: 'content_loss',
      message: `Cleaning removed ${Math.round((1 - ratio) * 100)}% of content`,
      details: { rawLength: rawText.length, cleanedLength: cleanedText.length, ratio },
    });
  }

  // Check heading preservation
  const rawHeadings = countHeadings(rawText);
  const cleanedHeadings = countHeadings(cleanedText);
  if (rawHeadings > 0 && cleanedHeadings < rawHeadings) {
    const lost = rawHeadings - cleanedHeadings;
    flags.push({
      stage: 'clean',
      severity: cleanedHeadings === 0 ? 'warning' : 'info',
      code: 'heading_loss',
      message: `${lost} of ${rawHeadings} headings lost during cleaning`,
      details: { rawHeadings, cleanedHeadings },
    });
  }

  return flags;
}

/**
 * Check chunking stage quality by verifying coverage and chunk health.
 */
export function checkChunkingQuality(cleanedText: string, chunks: Chunk[]): QualityFlag[] {
  const flags: QualityFlag[] = [];

  if (!cleanedText.length || chunks.length === 0) return flags;

  // Check for empty or very small chunks
  const emptyChunks = chunks.filter((c) => c.content.trim().length < 20);
  if (emptyChunks.length > 0) {
    flags.push({
      stage: 'chunk',
      severity: 'warning',
      code: 'empty_chunks',
      message: `${emptyChunks.length} chunk(s) have less than 20 characters`,
      details: { emptyChunkIndices: emptyChunks.map((c) => c.index) },
    });
  }

  // Check for excessive chunk count (likely a parsing issue)
  if (chunks.length > 200) {
    flags.push({
      stage: 'chunk',
      severity: 'warning',
      code: 'excessive_chunks',
      message: `Document produced ${chunks.length} chunks — may indicate a parsing issue`,
      details: { chunkCount: chunks.length },
    });
  }

  // Check content coverage — reassemble chunks and compare
  const totalChunkChars = chunks.reduce((sum, c) => sum + c.content.trim().length, 0);
  const cleanedLength = cleanedText.trim().length;
  // Chunks can overlap, so total may exceed cleaned length. But if significantly less, content was lost.
  // Use a conservative check: total unique content should be at least 80% of cleaned text.
  // Since we can't perfectly deduplicate overlap, check that total chars (with overlap) is at least 90% of cleaned.
  if (cleanedLength > 0 && totalChunkChars < cleanedLength * 0.9) {
    const coverage = Math.round((totalChunkChars / cleanedLength) * 100);
    flags.push({
      stage: 'chunk',
      severity: coverage < 50 ? 'error' : 'warning',
      code: 'low_coverage',
      message: `Chunks cover ~${coverage}% of cleaned text`,
      details: { totalChunkChars, cleanedLength, coverage },
    });
  }

  return flags;
}

/**
 * Check extraction stage quality by examining metadata confidence scores.
 */
export function checkExtractionQuality(metadata: EnrichedMetadata): QualityFlag[] {
  const flags: QualityFlag[] = [];

  // Check per-field confidence scores
  const lowConfidenceFields: string[] = [];
  for (const [field, score] of Object.entries(metadata.fieldConfidence)) {
    if (score < 0.5) {
      lowConfidenceFields.push(`${field} (${Math.round(score * 100)}%)`);
    }
  }

  if (lowConfidenceFields.length > 0) {
    flags.push({
      stage: 'extract',
      severity: 'warning',
      code: 'low_confidence',
      message: `Low confidence on: ${lowConfidenceFields.join(', ')}`,
      details: { fieldConfidence: metadata.fieldConfidence },
    });
  }

  // Check for missing or very short summary
  if (!metadata.summary || metadata.summary.trim().length < 20) {
    flags.push({
      stage: 'extract',
      severity: 'warning',
      code: 'missing_summary',
      message: 'AI-generated summary is missing or very short',
    });
  }

  return flags;
}

function countHeadings(text: string): number {
  const matches = text.match(/^#{1,6}\s+/gm);
  return matches ? matches.length : 0;
}
