import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '@/lib/config';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const documentQueue = new Queue('document-processing', {
  connection,
  defaultJobOptions: {
    attempts: config.queue.documentProcessing.attempts,
    backoff: { type: 'exponential', delay: config.queue.documentProcessing.backoffDelay },
    removeOnComplete: { count: config.queue.documentProcessing.removeOnComplete },
    removeOnFail: { count: config.queue.documentProcessing.removeOnFail },
  },
});

/**
 * Enqueue a document for processing through the ingestion pipeline.
 * Pass force=true when reprocessing to avoid BullMQ job ID collision.
 */
export async function queueDocument(documentId: number, force = false): Promise<void> {
  await documentQueue.add(
    'process-document',
    { documentId },
    {
      jobId: force ? `doc-${documentId}-${Date.now()}` : `doc-${documentId}`,
    }
  );
}
