import { config } from '@/lib/config';
import { createJobQueue } from '@/lib/queue';

export type DocumentJob = { documentId: number };

const cfg = config.queue.documentProcessing;

export const documentQueue = createJobQueue<DocumentJob>('document-processing', {
  attempts: cfg.attempts,
  backoffDelayMs: cfg.backoffDelay,
  removeOnComplete: cfg.removeOnComplete,
  removeOnFail: cfg.removeOnFail,
});

/**
 * Enqueue a document for processing through the ingestion pipeline.
 * Pass force=true to queue it even while a job for it is unfinished (reprocessing).
 */
export async function queueDocument(documentId: number, force = false): Promise<void> {
  await documentQueue.add(
    'process-document',
    { documentId },
    { jobId: force ? `doc-${documentId}-${Date.now()}` : `doc-${documentId}` }
  );
}
