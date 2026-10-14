import { eq } from 'drizzle-orm';
import { enterAiUser, isPermanentAiError } from '@/lib/ai/guard';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { adminDocuments, adminInboxItems } from '@/lib/db/schema';
import type { JobContext } from '@/lib/queue';
import { routingQueue } from './queue';
import { buildWorkspaceMap, routeMaterial } from './router';
import type { RoutingJobData } from './types';

async function processRouting(job: JobContext<RoutingJobData>): Promise<void> {
  const { inboxItemId } = job.data;

  const [item] = await db.select().from(adminInboxItems).where(eq(adminInboxItems.id, inboxItemId));

  if (!item) {
    throw new Error(`Inbox item ${inboxItemId} not found`);
  }
  // Routing's AI call counts against the item owner's budget
  if (item.userId) enterAiUser(item.userId);

  // Update status to processing
  await db
    .update(adminInboxItems)
    .set({ status: 'processing' })
    .where(eq(adminInboxItems.id, inboxItemId));

  // Get the material content and enriched metadata (if available)
  let materialContent = item.content ?? '';
  let enrichedMetadata: import('@/lib/document-processing/metadata').EnrichedMetadata | undefined;

  // If this is a file with a linked document, use the document's cleaned text and metadata
  if (item.documentId) {
    const [doc] = await db
      .select({
        cleanedText: adminDocuments.cleanedText,
        aiSummary: adminDocuments.aiSummary,
        metadata: adminDocuments.metadata,
      })
      .from(adminDocuments)
      .where(eq(adminDocuments.id, item.documentId));

    if (doc?.cleanedText) {
      materialContent = doc.cleanedText;
    }

    // Pass enriched metadata to router if available
    if (doc?.metadata && typeof doc.metadata === 'object' && 'summary' in doc.metadata) {
      enrichedMetadata =
        doc.metadata as import('@/lib/document-processing/metadata').EnrichedMetadata;
    }
  }

  if (!materialContent.trim()) {
    await db
      .update(adminInboxItems)
      .set({
        status: 'failed',
        processingError: 'No content to route',
        processedAt: new Date(),
      })
      .where(eq(adminInboxItems.id, inboxItemId));
    return;
  }

  // Build workspace map scoped to the item's owner
  const workspaceMap = await buildWorkspaceMap(item.userId ?? undefined);
  const suggestions = await routeMaterial(
    item.title,
    materialContent,
    workspaceMap,
    enrichedMetadata
  );

  // Save results
  await db
    .update(adminInboxItems)
    .set({
      status: suggestions.length > 0 ? 'routed' : 'failed',
      routingResults: suggestions,
      processingError: suggestions.length === 0 ? 'No suitable sections found' : null,
      processedAt: new Date(),
    })
    .where(eq(adminInboxItems.id, inboxItemId));
}

// ── Start worker ─────────────────────────────────────────────────────────────

/**
 * Wraps processRouting with error recording. A thrown error is retried by the
 * queue, except a spent budget or an unattributed call, which won't fix itself.
 */
export async function handleRoutingJob(job: JobContext<RoutingJobData>): Promise<void> {
  try {
    await processRouting(job);
    console.log(`[routing-worker] Inbox item ${job.data.inboxItemId} routed successfully`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown routing error';
    console.error(`[routing-worker] Inbox item ${job.data.inboxItemId} failed:`, message);

    await db
      .update(adminInboxItems)
      .set({
        status: 'failed',
        processingError: message,
        processedAt: new Date(),
      })
      .where(eq(adminInboxItems.id, job.data.inboxItemId));

    if (isPermanentAiError(error)) {
      job.discard();
      return;
    }
    throw error;
  }
}

routingQueue.process(handleRoutingJob, { concurrency: config.queue.routing.concurrency });
