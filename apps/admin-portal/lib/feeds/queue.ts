import { Queue } from 'bullmq';
import { config } from '@/lib/config';
import { getRedis } from '@/lib/redis';

let feedQueue: Queue | null = null;

/** The feed-monitor queue, created (and connected to Redis) on first use. */
export function getFeedQueue(): Queue {
  feedQueue ??= new Queue('feed-monitor', {
    connection: getRedis('Feed monitoring'),
    defaultJobOptions: {
      attempts: config.queue.feedMonitor.attempts,
      backoff: { type: 'exponential', delay: config.queue.feedMonitor.backoffDelay },
      removeOnComplete: { count: config.queue.feedMonitor.removeOnComplete },
      removeOnFail: { count: config.queue.feedMonitor.removeOnFail },
    },
  });
  return feedQueue;
}
