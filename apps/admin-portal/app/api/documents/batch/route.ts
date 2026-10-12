import { generateText } from 'ai';
import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { cleanText } from '@/lib/document-processing/cleaner';
import { queueDocument } from '@/lib/document-processing/queue';
import { storage } from '@/lib/storage';
import { queueRouting } from '@/lib/workspace-routing/queue';

export async function POST(request: Request) {
  const user = await requireAuthApi();
  await requireAiAllowance(user);
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { action: string; documentIds: number[] };
  const { action, documentIds } = body;

  if (!action || !Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json({ error: 'action and documentIds are required' }, { status: 400 });
  }

  // Verify all documents belong to the user
  const docs = await db
    .select()
    .from(adminDocuments)
    .where(and(inArray(adminDocuments.id, documentIds), eq(adminDocuments.userId, user.id)));

  if (docs.length === 0) {
    return NextResponse.json({ error: 'No matching documents found' }, { status: 404 });
  }

  let processed = 0;
  let failed = 0;

  if (action === 'reprocess') {
    const PROCESSING_STATUSES = new Set([
      'uploaded',
      'extracting',
      'cleaning',
      'chunking',
      'embedding',
      'analyzing',
    ]);

    for (const doc of docs) {
      if (PROCESSING_STATUSES.has(doc.status)) continue;

      await db.delete(adminDocumentChunks).where(eq(adminDocumentChunks.documentId, doc.id));
      // Preserve rawText for note/feed sources (they have no file on disk)
      const preserveRawText = doc.source === 'note' || doc.source === 'feed';
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

      await queueDocument(doc.id, true);
      processed++;
    }

    return NextResponse.json({
      processed,
      message: `${processed} document${processed === 1 ? '' : 's'} queued for reprocessing`,
    });
  }

  if (action === 'reclean') {
    for (const doc of docs) {
      if (!doc.rawText) {
        failed++;
        continue;
      }
      const cleaned = cleanText(doc.rawText);
      await db
        .update(adminDocuments)
        .set({ cleanedText: cleaned, updatedAt: new Date() })
        .where(eq(adminDocuments.id, doc.id));
      processed++;
    }

    return NextResponse.json({
      processed,
      failed,
      message: `${processed} document${processed === 1 ? '' : 's'} re-cleaned${failed > 0 ? `, ${failed} skipped (no raw text)` : ''}`,
    });
  }

  if (action === 'ai-cleanup') {
    const cfg = await loadConfig();

    for (const doc of docs) {
      const sourceText = doc.cleanedText || doc.rawText;
      if (!sourceText) {
        failed++;
        continue;
      }
      try {
        const result = await generateText({
          model: getModel(cfg),
          system:
            'You are a document formatting specialist. Rewrite the following text into clean, well-structured markdown. Fix formatting issues, improve heading structure, clean up artifacts from PDF/document extraction, and ensure consistent formatting. Preserve all factual content exactly. Output ONLY the cleaned markdown, no explanations.',
          messages: [{ role: 'user', content: sourceText }],
        });
        await db
          .update(adminDocuments)
          .set({ cleanedText: result.text, updatedAt: new Date() })
          .where(eq(adminDocuments.id, doc.id));
        processed++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      processed,
      failed,
      message: `${processed} document${processed === 1 ? '' : 's'} cleaned with AI${failed > 0 ? `, ${failed} failed` : ''}`,
    });
  }

  if (action === 'send-to-inbox') {
    for (const doc of docs) {
      // Skip docs that already have a pending/processing/routed inbox item
      const [existing] = await db
        .select({ id: adminInboxItems.id })
        .from(adminInboxItems)
        .where(
          and(
            eq(adminInboxItems.documentId, doc.id),
            inArray(adminInboxItems.status, ['pending', 'processing', 'routed'])
          )
        )
        .limit(1);

      if (existing) {
        failed++;
        continue;
      }

      const [inboxItem] = await db
        .insert(adminInboxItems)
        .values({
          type: doc.source === 'note' ? 'note' : doc.source === 'url' ? 'url' : 'file',
          title: doc.title,
          content: doc.source === 'note' ? doc.rawText : null,
          documentId: doc.id,
          status: 'pending',
          userId: user.id,
        })
        .returning();

      if (doc.status === 'ready' && inboxItem) {
        // Doc already processed — skip straight to routing
        await queueRouting(inboxItem.id, true);
      } else {
        // Doc needs (re)processing first, routing happens after
        await queueDocument(doc.id, true);
      }

      processed++;
    }

    return NextResponse.json({
      processed,
      failed,
      message: `${processed} document${processed === 1 ? '' : 's'} sent to inbox${failed > 0 ? `, ${failed} skipped (already in inbox)` : ''}`,
    });
  }

  if (action === 'archive') {
    for (const doc of docs) {
      await db
        .update(adminDocuments)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(adminDocuments.id, doc.id));
      processed++;
    }

    return NextResponse.json({
      processed,
      message: `${processed} document${processed === 1 ? '' : 's'} archived`,
    });
  }

  if (action === 'delete') {
    for (const doc of docs) {
      // Remove file from storage (ignore if already missing)
      try {
        await storage.remove(doc.filePath);
      } catch {
        // File may already be deleted
      }

      // Nullify inbox item references
      await db
        .update(adminInboxItems)
        .set({ documentId: null })
        .where(eq(adminInboxItems.documentId, doc.id));

      // Delete document (chunks + section sources cascade via FK)
      await db.delete(adminDocuments).where(eq(adminDocuments.id, doc.id));
      processed++;
    }

    return NextResponse.json({
      processed,
      message: `${processed} document${processed === 1 ? '' : 's'} deleted`,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
