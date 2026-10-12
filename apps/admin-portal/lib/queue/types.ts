/**
 * The job queue seam: what the document-processing and workspace-routing
 * queues need, with a BullMQ implementation (QUEUE_DRIVER=bullmq, the dev
 * default) and an in-process one (QUEUE_DRIVER=memory, the single-instance
 * demo). lib/queue/contract.test.ts runs the same behaviour tests on both.
 *
 * Not covered: repeatable/cron jobs, queue inspection and pub/sub. The queues
 * that need those (feeds, backups, research agents) stay on BullMQ and only
 * run with QUEUE_DRIVER=bullmq.
 */
export interface JobContext<T> {
  id: string;
  name: string;
  data: T;
  /** 1-based attempt number. */
  attempt: number;
  updateProgress(progress: number): void | Promise<void>;
  /** Mark the job so a thrown error is not retried. */
  discard(): void;
}

export type JobHandler<T> = (job: JobContext<T>) => Promise<void>;

export interface JobQueueOptions {
  /** Total tries, including the first. */
  attempts: number;
  /** Retry delay doubles each time: backoffDelayMs, 2×, 4×… */
  backoffDelayMs: number;
  /** BullMQ only: how many finished jobs to keep in Redis for inspection. */
  removeOnComplete?: number;
  removeOnFail?: number;
}

export interface AddOptions {
  /**
   * Deduplication key. A job whose id is already waiting, delayed (between
   * retries) or running is dropped; once that job has finished, the same id
   * can be queued again.
   */
  jobId?: string;
}

export interface JobQueue<T> {
  readonly name: string;
  add(name: string, data: T, opts?: AddOptions): Promise<void>;
  /** Register the processor. Call once per process; a second call replaces it. */
  process(handler: JobHandler<T>, opts?: { concurrency?: number }): void;
  /** Resolves when nothing is waiting, delayed or running. */
  drained(): Promise<void>;
  /** Stops taking jobs and waits for running ones to finish. */
  close(): Promise<void>;
}
