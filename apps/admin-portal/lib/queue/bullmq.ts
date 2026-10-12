import { type Job, Queue, Worker } from 'bullmq';
import { getRedis } from '@/lib/redis';
import type { AddOptions, JobHandler, JobQueue, JobQueueOptions } from './types';

const DRAIN_POLL_MS = 100;

/**
 * BullMQ implementation (QUEUE_DRIVER=bullmq). The Queue and Worker are
 * created on first use, so importing a queue module doesn't connect to Redis.
 */
export class BullMQQueue<T> implements JobQueue<T> {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    readonly name: string,
    private opts: JobQueueOptions
  ) {}

  private getQueue(): Queue {
    this.queue ??= new Queue(this.name, {
      connection: getRedis(`The ${this.name} queue`),
      defaultJobOptions: {
        attempts: this.opts.attempts,
        backoff: { type: 'exponential', delay: this.opts.backoffDelayMs },
        removeOnComplete: { count: this.opts.removeOnComplete ?? 100 },
        removeOnFail: { count: this.opts.removeOnFail ?? 100 },
      },
    });
    return this.queue;
  }

  async add(name: string, data: T, opts?: AddOptions): Promise<void> {
    const queue = this.getQueue();
    if (opts?.jobId) {
      // BullMQ ignores an id it still holds, including finished jobs it keeps
      // for inspection. The contract dedupes only unfinished jobs, so clear a
      // finished one first.
      const existing = await queue.getJob(opts.jobId);
      const state = await existing?.getState();
      if (state === 'completed' || state === 'failed') await existing?.remove();
    }
    await queue.add(name, data, { jobId: opts?.jobId });
  }

  process(handler: JobHandler<T>, opts?: { concurrency?: number }): void {
    const worker = new Worker(
      this.name,
      async (job: Job<T>) =>
        handler({
          id: job.id ?? '',
          name: job.name,
          data: job.data,
          attempt: job.attemptsMade + 1,
          updateProgress: (progress) => job.updateProgress(progress),
          discard: () => job.discard(),
        }),
      { connection: getRedis(`The ${this.name} worker`), concurrency: opts?.concurrency ?? 1 }
    );
    worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        console.error(`[queue:${this.name}] job ${job.id} failed permanently:`, error.message);
      }
    });
    // Without a listener, an 'error' event (e.g. Redis dropping) would throw
    worker.on('error', (error) => console.error(`[queue:${this.name}] worker error:`, error));
    const previous = this.worker;
    this.worker = worker;
    void previous?.close();
  }

  async drained(): Promise<void> {
    const queue = this.getQueue();
    for (;;) {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      if (Object.values(counts).every((n) => n === 0)) return;
      await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
    }
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }
}
