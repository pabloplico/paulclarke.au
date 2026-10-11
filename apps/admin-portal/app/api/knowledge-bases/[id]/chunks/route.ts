import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  adminDocumentChunks,
  adminDocuments,
  adminKbChunks,
  adminKnowledgeBases,
} from '@/lib/db/schema';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const kbId = Number(id);

  if (Number.isNaN(kbId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  // Verify KB ownership
  const [kb] = await db
    .select({ id: adminKnowledgeBases.id })
    .from(adminKnowledgeBases)
    .where(and(eq(adminKnowledgeBases.id, kbId), eq(adminKnowledgeBases.userId, user.id)));

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  const rows = await db
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

  return NextResponse.json(rows);
}
