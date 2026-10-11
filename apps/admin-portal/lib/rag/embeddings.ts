import { embed, embedMany } from 'ai';
import { getEmbeddingModel } from '@/lib/ai/models';
import { config } from '@/lib/config';

/**
 * Generate embedding for a single text using OpenAI text-embedding-3-small.
 * Returns a 1536-dimensional vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: getEmbeddingModel(), value: text });
  return embedding;
}

/**
 * Generate embeddings for multiple texts in batches.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { batchSize } = config.ai.embedding;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const { embeddings } = await embedMany({ model: getEmbeddingModel(), values: batch });
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
