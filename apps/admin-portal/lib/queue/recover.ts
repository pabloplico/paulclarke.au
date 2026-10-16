import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentRuns, adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';
import { queueRouting } from '@/lib/workspace-routing/queue';

/** Document statuses the worker sets on the way to 'ready' or 'error'. */
export const UNFINISHED_DOCUMENT_STATUSES = [
  'uploaded',
  'extracting',
  'cleaning',
  'chunking',
  'embedding',
  'analyzing',
] as const;

/**
 * Re-queues work the in-process queues lost when the process stopped. Call
 * once on boot, after the workers are registered.
 *
 * - Documents still in an unfinished status are processed again. Processing
 *   starts from the stored file, so a half-processed document is redone.
 * - Inbox items stuck in 'processing' were mid-routing. Items still 'pending'
 *   whose document is already 'ready' finished processing but never got
 *   their routing job. Both are routed again.
 *
 * - Agent runs still 'started' were cut off mid-run. They're marked 'failed'
 *   ("interrupted by restart"), not run again: a run spends money, and the
 *   user can trigger it again.
 *
 * Uses the same job ids as the normal enqueue path, so anything already
 * queued isn't duplicated.
 */
export async function recoverInterruptedJobs(): Promise<{
  documents: number;
  inboxItems: number;
  agentRuns: number;
}> {
  const documents = await db
    .select({ id: adminDocuments.id })
    .from(adminDocuments)
    .where(inArray(adminDocuments.status, [...UNFINISHED_DOCUMENT_STATUSES]));
  for (const { id } of documents) await queueDocument(id);

  const inboxItems = await db
    .select({ id: adminInboxItems.id })
    .from(adminInboxItems)
    .leftJoin(adminDocuments, eq(adminDocuments.id, adminInboxItems.documentId))
    .where(
      or(
        eq(adminInboxItems.status, 'processing'),
        and(eq(adminInboxItems.status, 'pending'), eq(adminDocuments.status, 'ready'))
      )
    );
  for (const { id } of inboxItems) await queueRouting(id);

  const agentRuns = await db
    .update(adminAgentRuns)
    .set({ status: 'failed', completedAt: new Date(), errorLog: 'interrupted by restart' })
    .where(eq(adminAgentRuns.status, 'started'))
    .returning({ id: adminAgentRuns.id });

  if (documents.length || inboxItems.length) {
    console.log(
      `[queue] Re-queued ${documents.length} document(s) and ${inboxItems.length} inbox item(s) interrupted by a restart`
    );
  }
  if (agentRuns.length) {
    console.log(
      `[queue] Marked ${agentRuns.length} agent run(s) interrupted by a restart as failed`
    );
  }
  return {
    documents: documents.length,
    inboxItems: inboxItems.length,
    agentRuns: agentRuns.length,
  };
}
