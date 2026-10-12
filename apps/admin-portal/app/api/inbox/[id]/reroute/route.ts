import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';
import { queueRouting } from '@/lib/workspace-routing/queue';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const user = await requireAuthApi();
  await requireAiAllowance(user);
  const { id } = await params;

  const [item] = await db
    .select()
    .from(adminInboxItems)
    .where(and(eq(adminInboxItems.id, Number(id)), eq(adminInboxItems.userId, user.id)));

  if (!item) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
  }

  // Reset inbox item status
  await db
    .update(adminInboxItems)
    .set({
      status: 'pending',
      routingResults: null,
      processingError: null,
      processedAt: null,
    })
    .where(eq(adminInboxItems.id, item.id));

  // If the linked document failed, reprocess it (which will then queue routing on completion)
  if (item.documentId) {
    const [doc] = await db
      .select({ status: adminDocuments.status, source: adminDocuments.source })
      .from(adminDocuments)
      .where(eq(adminDocuments.id, item.documentId));

    if (doc && doc.status === 'error') {
      // Reset document and clear old chunks
      await db
        .delete(adminDocumentChunks)
        .where(eq(adminDocumentChunks.documentId, item.documentId));

      // Preserve rawText for notes — their content only exists in the DB
      const isTextSource = doc.source === 'note' || doc.source === 'url';
      await db
        .update(adminDocuments)
        .set({
          status: 'uploaded',
          processingError: null,
          ...(isTextSource ? {} : { rawText: null }),
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
        .where(eq(adminDocuments.id, item.documentId));

      await queueDocument(item.documentId, true);
      return NextResponse.json({ success: true, reprocessing: true }, { status: 202 });
    }
  }

  // Document is fine — just re-queue routing
  await queueRouting(item.id);

  return NextResponse.json({ success: true }, { status: 202 });
}
