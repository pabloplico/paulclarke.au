import { and, eq, notInArray } from 'drizzle-orm';
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

  // Get chunk IDs already in this KB
  const existing = await db
    .select({ chunkId: adminKbChunks.chunkId })
    .from(adminKbChunks)
    .where(eq(adminKbChunks.knowledgeBaseId, kbId));

  const existingIds = existing.map((e) => e.chunkId);

  // Get approved chunks not yet in this KB
  const conditions = [eq(adminDocumentChunks.curationStatus, 'approved')];
  if (existingIds.length > 0) {
    conditions.push(notInArray(adminDocumentChunks.id, existingIds));
  }

  const rows = await db
    .select({
      chunkId: adminDocumentChunks.id,
      content: adminDocumentChunks.content,
      chunkIndex: adminDocumentChunks.chunkIndex,
      tokenCount: adminDocumentChunks.tokenCount,
      metadata: adminDocumentChunks.metadata,
      documentId: adminDocuments.id,
      documentTitle: adminDocuments.title,
    })
    .from(adminDocumentChunks)
    .innerJoin(adminDocuments, eq(adminDocumentChunks.documentId, adminDocuments.id))
    .where(and(...conditions))
    .orderBy(adminDocuments.title, adminDocumentChunks.chunkIndex);

  return NextResponse.json(rows);
}
