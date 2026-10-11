import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '@/lib/config';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const feedQueue = new Queue('feed-monitor', {
  connection,
  defaultJobOptions: {
    attempts: config.queue.feedMonitor.attempts,
    backoff: { type: 'exponential', delay: config.queue.feedMonitor.backoffDelay },
    removeOnComplete: { count: config.queue.feedMonitor.removeOnComplete },
    removeOnFail: { count: config.queue.feedMonitor.removeOnFail },
  },
});
