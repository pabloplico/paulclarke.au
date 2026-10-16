/**
 * The job queue seam: what the document-processing, workspace-routing and
 * research-agent queues need. Its one implementation is InProcessQueue: the
 * app is single-instance by design. The interface stays as the test seam;
 * lib/queue/contract.test.ts holds the behaviour any implementation must have.
 *
 * Not covered: repeatable/cron jobs, queue inspection and pub/sub. Nothing
 * uses them.
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
