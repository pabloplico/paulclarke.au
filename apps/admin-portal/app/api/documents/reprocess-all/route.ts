import { and, eq, notInArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';

const PROCESSING_STATUSES = [
  'uploaded',
  'extracting',
  'cleaning',
  'chunking',
  'embedding',
  'analyzing',
];

export async function POST() {
  const user = await requireAuthApi();

  // Find all documents that aren't currently processing
  const eligible = await db
    .select({ id: adminDocuments.id, status: adminDocuments.status, source: adminDocuments.source })
    .from(adminDocuments)
    .where(
      and(
        eq(adminDocuments.userId, user.id),
        notInArray(adminDocuments.status, PROCESSING_STATUSES)
      )
    );

  if (eligible.length === 0) {
    return NextResponse.json({ queued: 0, message: 'No documents to reprocess' });
  }

  // Reset and re-queue each document
  let queued = 0;
  for (const doc of eligible) {
    // Clear previous chunks
    await db.delete(adminDocumentChunks).where(eq(adminDocumentChunks.documentId, doc.id));

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
        metadata: null,
        processingStartedAt: null,
        processingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(adminDocuments.id, doc.id));

    // Reset any linked inbox items so they re-enter the inbox after routing
    await db
      .update(adminInboxItems)
      .set({
        status: 'pending',
        routingResults: null,
        approvedResults: null,
        processingError: null,
        qualityFlags: null,
        processedAt: null,
      })
      .where(eq(adminInboxItems.documentId, doc.id));

    await queueDocument(doc.id, true);
    queued++;
  }

  return NextResponse.json({
    queued,
    message: `${queued} document${queued === 1 ? '' : 's'} queued for reprocessing`,
  });
}
