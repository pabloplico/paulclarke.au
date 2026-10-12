import { queueDriver } from '@/lib/drivers';
import { BullMQQueue } from './bullmq';
import { InProcessQueue } from './in-process';
import type { JobQueue, JobQueueOptions } from './types';

export type { JobContext, JobHandler, JobQueue, JobQueueOptions } from './types';

// Next.js can evaluate a module once for instrumentation and again for route
// bundles. Queues are process-wide, or an in-memory job added by a route would
// never reach the worker registered by instrumentation.
const registry = globalThis as unknown as { __jobQueues?: Map<string, JobQueue<unknown>> };

/** The queue called `name`, on the driver QUEUE_DRIVER selects. */
export function createJobQueue<T>(name: string, opts: JobQueueOptions): JobQueue<T> {
  registry.__jobQueues ??= new Map();
  let queue = registry.__jobQueues.get(name);
  if (!queue) {
    queue =
      queueDriver() === 'memory'
        ? new InProcessQueue<unknown>(name, opts)
        : new BullMQQueue<unknown>(name, opts);
    registry.__jobQueues.set(name, queue);
  }
  return queue as JobQueue<T>;
}
