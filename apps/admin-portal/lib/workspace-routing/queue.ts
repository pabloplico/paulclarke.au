import { config } from '@/lib/config';
import { createJobQueue } from '@/lib/queue';
import type { RoutingJobData } from './types';

const cfg = config.queue.routing;

export const routingQueue = createJobQueue<RoutingJobData>('workspace-routing', {
  attempts: cfg.attempts,
  backoffDelayMs: cfg.backoffDelay,
  removeOnComplete: cfg.removeOnComplete,
  removeOnFail: cfg.removeOnFail,
});

/**
 * Enqueue an inbox item for AI routing to workspace sections.
 * Pass force=true to queue it even while a routing job for it is unfinished.
 */
export async function queueRouting(inboxItemId: number, force = false): Promise<void> {
  const jobId = force ? `route-${inboxItemId}-${Date.now()}` : `route-${inboxItemId}`;
  await routingQueue.add('route-material', { inboxItemId }, { jobId });
}
