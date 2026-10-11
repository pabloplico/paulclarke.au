import { count, countDistinct, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import {
  adminDocumentChunks,
  adminDocuments,
  adminKbChunks,
  adminKnowledgeBases,
} from '@/lib/db/schema';
import type { KnowledgeBaseWithStats } from '@/lib/types';
import { KbDetailView } from './kb-detail-view';

export const dynamic = 'force-dynamic';

export default async function KbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kbId = Number(id);
  if (Number.isNaN(kbId)) notFound();

  const [kb] = await db.select().from(adminKnowledgeBases).where(eq(adminKnowledgeBases.id, kbId));
  if (!kb) notFound();

  const [stats] = await db
    .select({
      chunkCount: count(adminKbChunks.chunkId),
      documentCount: countDistinct(adminDocumentChunks.documentId),
    })
    .from(adminKbChunks)
    .innerJoin(adminDocumentChunks, eq(adminKbChunks.chunkId, adminDocumentChunks.id))
    .where(eq(adminKbChunks.knowledgeBaseId, kbId));

  const enrichedKb: KnowledgeBaseWithStats = {
    ...kb,
    chunkCount: stats?.chunkCount ?? 0,
    documentCount: stats?.documentCount ?? 0,
  };

  const chunks = await db
    .select({
      kbChunkId: adminKbChunks.id,
      addedAt: adminKbChunks.addedAt,
      chunkId: adminDocumentChunks.id,
      content: adminDocumentChunks.content,
      chunkIndex: adminDocumentChunks.chunkIndex,
      tokenCount: adminDocumentChunks.tokenCount,
      metadata: adminDocumentChunks.metadata,
      curationStatus: adminDocumentChunks.curationStatus,
      documentId: adminDocuments.id,
      documentTitle: adminDocuments.title,
    })
    .from(adminKbChunks)
    .innerJoin(adminDocumentChunks, eq(adminKbChunks.chunkId, adminDocumentChunks.id))
    .innerJoin(adminDocuments, eq(adminDocumentChunks.documentId, adminDocuments.id))
    .where(eq(adminKbChunks.knowledgeBaseId, kbId))
    .orderBy(adminDocuments.title, adminDocumentChunks.chunkIndex);

  return <KbDetailView initialKb={enrichedKb} initialChunks={chunks} />;
}
