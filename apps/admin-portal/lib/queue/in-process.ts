import type { AddOptions, JobContext, JobHandler, JobQueue, JobQueueOptions } from './types';

type Pending<T> = { id: string; name: string; data: T; attempt: number };

/**
 * In-memory queue for the single-instance demo (QUEUE_DRIVER=memory).
 *
 * Jobs live only in this process: anything waiting or running is lost on
 * restart. lib/queue/recover.ts re-queues interrupted work on boot.
 */
export class InProcessQueue<T> implements JobQueue<T> {
  private waiting: Pending<T>[] = [];
  /** Ids that are waiting, delayed or running: the deduplication set. */
  private pending = new Set<string>();
  private running = new Set<Promise<void>>();
  private retryTimers = new Set<ReturnType<typeof setTimeout>>();
  private handler: JobHandler<T> | null = null;
  private concurrency = 1;
  private idleWaiters: (() => void)[] = [];
  private seq = 0;
  private closed = false;

  constructor(
    readonly name: string,
    private opts: JobQueueOptions
  ) {}

  async add(name: string, data: T, opts?: AddOptions): Promise<void> {
    if (this.closed) throw new Error(`Queue ${this.name} is closed`);
    const id = opts?.jobId ?? `${this.name}-${++this.seq}`;
    if (this.pending.has(id)) return;
    this.pending.add(id);
    this.waiting.push({ id, name, data, attempt: 1 });
    this.pump();
  }

  process(handler: JobHandler<T>, opts?: { concurrency?: number }): void {
    // A re-evaluated worker module (dev HMR) replaces the processor
    this.handler = handler;
    this.concurrency = Math.max(1, opts?.concurrency ?? 1);
    this.pump();
  }

  drained(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();
    this.waiting = [];
    await Promise.all(this.running);
    this.pending.clear();
    this.notifyIfIdle();
  }

  private isIdle() {
    return this.waiting.length === 0 && this.running.size === 0 && this.retryTimers.size === 0;
  }

  private notifyIfIdle() {
    if (this.isIdle()) for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  private pump() {
    const handler = this.handler;
    if (handler && !this.closed) {
      while (this.running.size < this.concurrency) {
        const job = this.waiting.shift();
        if (!job) break;
        const run = this.run(handler, job).finally(() => {
          this.running.delete(run);
          this.pump();
        });
        this.running.add(run);
      }
    }
    this.notifyIfIdle();
  }

  private async run(handler: JobHandler<T>, job: Pending<T>): Promise<void> {
    let discarded = false;
    const ctx: JobContext<T> = {
      id: job.id,
      name: job.name,
      data: job.data,
      attempt: job.attempt,
      updateProgress: () => {},
      discard: () => {
        discarded = true;
      },
    };
    try {
      await handler(ctx);
      this.pending.delete(job.id);
    } catch (error) {
      if (!discarded && !this.closed && job.attempt < this.opts.attempts) {
        const delay = this.opts.backoffDelayMs * 2 ** (job.attempt - 1);
        const timer = setTimeout(() => {
          this.retryTimers.delete(timer);
          this.waiting.push({ ...job, attempt: job.attempt + 1 });
          this.pump();
        }, delay);
        this.retryTimers.add(timer);
      } else {
        this.pending.delete(job.id);
        console.error(`[queue:${this.name}] job ${job.id} failed permanently:`, error);
      }
    }
  }
}
