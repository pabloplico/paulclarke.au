import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '@/lib/config';
import type { RoutingJobData } from './types';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const routingQueue = new Queue<RoutingJobData>('workspace-routing', {
  connection,
  defaultJobOptions: {
    attempts: config.queue.routing.attempts,
    backoff: { type: 'exponential', delay: config.queue.routing.backoffDelay },
    removeOnComplete: { count: config.queue.routing.removeOnComplete },
    removeOnFail: { count: config.queue.routing.removeOnFail },
  },
});

/**
 * Enqueue an inbox item for AI routing to workspace sections.
 * Pass force=true to avoid job ID collision when re-routing.
 */
export async function queueRouting(inboxItemId: number, force = false): Promise<void> {
  const jobId = force ? `route-${inboxItemId}-${Date.now()}` : `route-${inboxItemId}`;
  await routingQueue.add('route-material', { inboxItemId }, { jobId });
}
