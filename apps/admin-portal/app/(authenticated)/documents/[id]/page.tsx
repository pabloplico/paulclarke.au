import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments } from '@/lib/db/schema';
import { DocumentDetail } from './document-detail';

export const dynamic = 'force-dynamic';

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) notFound();

  const user = await requireAuth();

  const [doc] = await db
    .select()
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

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
    })
    .from(adminDocumentChunks)
    .where(eq(adminDocumentChunks.documentId, documentId))
    .orderBy(asc(adminDocumentChunks.chunkIndex));

  return <DocumentDetail doc={doc} chunks={chunks} />;
}
