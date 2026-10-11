import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments } from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  const [doc] = await db
    .select()
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const PROCESSING_STATUSES = new Set([
    'uploaded',
    'extracting',
    'cleaning',
    'chunking',
    'embedding',
    'analyzing',
  ]);
  if (PROCESSING_STATUSES.has(doc.status)) {
    return NextResponse.json({ error: 'Document is already being processed' }, { status: 409 });
  }

  // Clear previous chunks
  await db.delete(adminDocumentChunks).where(eq(adminDocumentChunks.documentId, documentId));

  // Preserve rawText for note/feed sources (they have no file on disk)
  const preserveRawText = doc.source === 'note' || doc.source === 'feed';

  // Reset document state
  await db
    .update(adminDocuments)
    .set({
      status: 'uploaded',
      processingError: null,
      ...(preserveRawText ? {} : { rawText: null }),
      cleanedText: null,
      aiSummary: null,
      aiTitle: null,
      aiTags: null,
      aiLanguage: null,
      aiDocumentType: null,
      processingStartedAt: null,
      processingCompletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(adminDocuments.id, documentId));

  // Re-queue for processing (force=true to avoid job ID collision)
  await queueDocument(documentId, true);

  return NextResponse.json({ message: 'Document re-queued for processing' }, { status: 202 });
}
