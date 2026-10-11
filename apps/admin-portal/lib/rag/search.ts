import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import {
  adminDocumentChunks,
  adminDocuments,
  adminFindings,
  adminKbChunks,
  adminWorkspaces,
} from '@/lib/db/schema';

export interface SearchResult {
  chunkId: number;
  content: string;
  score: number;
  documentId: number;
  documentTitle: string;
  chunkIndex: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Search a knowledge base by cosine distance against the query embedding.
 * Only returns approved chunks with embeddings that belong to the specified KB.
 */
export async function searchKnowledgeBase(
  knowledgeBaseId: number,
  queryEmbedding: number[],
  topK = config.rag.topK
): Promise<SearchResult[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const results = await db
    .select({
      chunkId: adminDocumentChunks.id,
      content: adminDocumentChunks.content,
      score: sql<number>`1 - (${adminDocumentChunks.embedding} <=> ${vectorLiteral}::vector)`,
      documentId: adminDocuments.id,
      documentTitle: adminDocuments.title,
      chunkIndex: adminDocumentChunks.chunkIndex,
      metadata: adminDocumentChunks.metadata,
    })
    .from(adminKbChunks)
    .innerJoin(adminDocumentChunks, eq(adminKbChunks.chunkId, adminDocumentChunks.id))
    .innerJoin(adminDocuments, eq(adminDocumentChunks.documentId, adminDocuments.id))
    .where(
      and(
        eq(adminKbChunks.knowledgeBaseId, knowledgeBaseId),
        eq(adminDocumentChunks.curationStatus, 'approved'),
        isNotNull(adminDocumentChunks.embedding)
      )
    )
    .orderBy(sql`${adminDocumentChunks.embedding} <=> ${vectorLiteral}::vector`)
    .limit(topK);

  return results;
}

/**
 * Search ALL documents by vector similarity (not KB-scoped).
 * Used for "Find source" to trace any text back to its source document.
 */
export async function searchAllDocuments(
  userId: number,
  queryEmbedding: number[],
  topK = 5,
  minScore = 0.3
): Promise<SearchResult[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const results = await db
    .select({
      chunkId: adminDocumentChunks.id,
      content: adminDocumentChunks.content,
      score: sql<number>`1 - (${adminDocumentChunks.embedding} <=> ${vectorLiteral}::vector)`,
      documentId: adminDocuments.id,
      documentTitle: adminDocuments.title,
      chunkIndex: adminDocumentChunks.chunkIndex,
      metadata: adminDocumentChunks.metadata,
    })
    .from(adminDocumentChunks)
    .innerJoin(adminDocuments, eq(adminDocumentChunks.documentId, adminDocuments.id))
    .where(and(eq(adminDocuments.userId, userId), isNotNull(adminDocumentChunks.embedding)))
    .orderBy(sql`${adminDocumentChunks.embedding} <=> ${vectorLiteral}::vector`)
    .limit(topK);

  // Filter by minimum similarity score
  return results.filter((r) => r.score >= minScore);
}

export interface FindingSearchResult {
  findingId: number;
  title: string;
  content: string;
  score: number;
  findingType: string;
  confidenceScore: number;
  workspaceId: number;
  workspaceTitle: string;
}

/**
 * Search research findings by vector similarity.
 * Optionally scoped to a single workspace.
 */
export async function searchFindings(
  userId: number,
  queryEmbedding: number[],
  topK = 5,
  minScore = 0.3,
  workspaceId?: number
): Promise<FindingSearchResult[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const conditions = [eq(adminFindings.userId, userId), isNotNull(adminFindings.embedding)];
  if (workspaceId) {
    conditions.push(eq(adminFindings.workspaceId, workspaceId));
  }

  const results = await db
    .select({
      findingId: adminFindings.id,
      title: adminFindings.title,
      content: adminFindings.content,
      score: sql<number>`1 - (${adminFindings.embedding} <=> ${vectorLiteral}::vector)`,
      findingType: adminFindings.findingType,
      confidenceScore: adminFindings.confidenceScore,
      workspaceId: adminFindings.workspaceId,
      workspaceTitle: adminWorkspaces.title,
    })
    .from(adminFindings)
    .innerJoin(adminWorkspaces, eq(adminFindings.workspaceId, adminWorkspaces.id))
    .where(and(...conditions))
    .orderBy(sql`${adminFindings.embedding} <=> ${vectorLiteral}::vector`)
    .limit(topK);

  return results.filter((r) => r.score >= minScore);
}

export type UnifiedSearchResult =
  | ({ source: 'knowledge' } & SearchResult)
  | ({ source: 'research' } & FindingSearchResult);

/**
 * Search both document chunks and research findings, returning merged results
 * sorted by similarity score.
 */
export async function searchUnified(
  userId: number,
  queryEmbedding: number[],
  topK = 10,
  minScore = 0.3,
  sources: 'knowledge' | 'research' | 'both' = 'both'
): Promise<UnifiedSearchResult[]> {
  const results: UnifiedSearchResult[] = [];

  if (sources === 'knowledge' || sources === 'both') {
    const docs = await searchAllDocuments(userId, queryEmbedding, topK, minScore);
    results.push(...docs.map((d) => ({ source: 'knowledge' as const, ...d })));
  }

  if (sources === 'research' || sources === 'both') {
    const findings = await searchFindings(userId, queryEmbedding, topK, minScore);
    results.push(...findings.map((f) => ({ source: 'research' as const, ...f })));
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
