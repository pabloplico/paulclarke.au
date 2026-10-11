import { eq, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import {
  adminDocumentChunks,
  adminDocuments,
  adminKbChunks,
  adminKnowledgeBases,
} from '@/lib/db/schema';
import type { ChunkWithCuration, KnowledgeBaseWithStats } from '@/lib/types';
import { ChunkReviewView } from './chunk-review-view';

export const dynamic = 'force-dynamic';

export default async function ChunkReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) notFound();

  const [doc] = await db.select().from(adminDocuments).where(eq(adminDocuments.id, documentId));
  if (!doc) notFound();

  const chunks = await db
    .select({
      id: adminDocumentChunks.id,
      documentId: adminDocumentChunks.documentId,
      content: adminDocumentChunks.content,
      chunkIndex: adminDocumentChunks.chunkIndex,
      tokenCount: adminDocumentChunks.tokenCount,
      metadata: adminDocumentChunks.metadata,
      createdAt: adminDocumentChunks.createdAt,
      curationStatus: adminDocumentChunks.curationStatus,
      curatorNote: adminDocumentChunks.curatorNote,
      reviewedAt: adminDocumentChunks.reviewedAt,
      embedding: adminDocumentChunks.embedding,
    })
    .from(adminDocumentChunks)
    .where(eq(adminDocumentChunks.documentId, documentId))
    .orderBy(adminDocumentChunks.chunkIndex);

  // Get KB assignments
  const chunkIds = chunks.map((c) => c.id);
  let kbAssignments: {
    chunkId: number;
    knowledgeBaseId: number;
    name: string;
    color: string | null;
  }[] = [];

  if (chunkIds.length > 0) {
    kbAssignments = await db
      .select({
        chunkId: adminKbChunks.chunkId,
        knowledgeBaseId: adminKbChunks.knowledgeBaseId,
        name: adminKnowledgeBases.name,
        color: adminKnowledgeBases.color,
      })
      .from(adminKbChunks)
      .innerJoin(adminKnowledgeBases, eq(adminKbChunks.knowledgeBaseId, adminKnowledgeBases.id))
      .where(sql`${adminKbChunks.chunkId} IN ${chunkIds}`);
  }

  const assignmentsByChunk = new Map<number, typeof kbAssignments>();
  for (const a of kbAssignments) {
    const existing = assignmentsByChunk.get(a.chunkId) || [];
    existing.push(a);
    assignmentsByChunk.set(a.chunkId, existing);
  }

  const enriched: ChunkWithCuration[] = chunks.map((chunk) => ({
    ...chunk,
    kbAssignments: (assignmentsByChunk.get(chunk.id) || []).map((a) => ({
      id: a.knowledgeBaseId,
      knowledgeBaseId: a.knowledgeBaseId,
      name: a.name,
      color: a.color,
    })),
  }));

  // Fetch all knowledge bases for KB assignment dropdown
  const knowledgeBases: KnowledgeBaseWithStats[] = (
    await db.select().from(adminKnowledgeBases)
  ).map((kb) => ({ ...kb, chunkCount: 0, documentCount: 0 }));

  return (
    <ChunkReviewView
      documentId={documentId}
      documentTitle={doc.title}
      initialChunks={enriched}
      knowledgeBases={knowledgeBases}
    />
  );
}
