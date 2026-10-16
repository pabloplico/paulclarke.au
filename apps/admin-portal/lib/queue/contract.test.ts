import { afterEach, describe, expect, it } from 'vitest';
import { InProcessQueue } from './in-process';
import type { JobContext, JobQueue, JobQueueOptions } from './types';

/**
 * What the JobQueue seam promises, run against its one implementation,
 * InProcessQueue. A new implementation should pass the same suite.
 */

const fast: JobQueueOptions = { attempts: 3, backoffDelayMs: 10 };

/** A promise plus the function that resolves it. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

function until(check: () => boolean, ms = 10_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > ms) return reject(new Error('timed out'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('JobQueue contract: InProcessQueue', () => {
  const queues: JobQueue<unknown>[] = [];
  let seq = 0;

  function queue<T>(opts: JobQueueOptions = fast): JobQueue<T> {
    const q = new InProcessQueue<T>(`contract-${++seq}`, opts);
    queues.push(q as JobQueue<unknown>);
    return q;
  }

  afterEach(async () => {
    await Promise.all(queues.splice(0).map((q) => q.close()));
  });

  it('runs a job with its name and data, as attempt 1', async () => {
    const q = queue<{ n: number }>();
    const seen: Pick<JobContext<{ n: number }>, 'name' | 'data' | 'attempt'>[] = [];
    q.process(async ({ name, data, attempt }) => {
      seen.push({ name, data, attempt });
    });
    await q.add('square', { n: 7 });
    await until(() => seen.length === 1);
    expect(seen).toEqual([{ name: 'square', data: { n: 7 }, attempt: 1 }]);
  });

  it('runs jobs added before a processor is registered', async () => {
    const q = queue<number>();
    await q.add('early', 1);
    await q.add('early', 2);
    const seen: number[] = [];
    q.process(async ({ data }) => {
      seen.push(data);
    });
    await until(() => seen.length === 2);
    expect(seen.sort()).toEqual([1, 2]);
  });

  it('retries a failing job until it succeeds', async () => {
    const q = queue<null>();
    const attempts: number[] = [];
    q.process(async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt < 3) throw new Error(`flaky ${attempt}`);
    });
    await q.add('flaky', null);
    await until(() => attempts.length === 3);
    await q.drained();
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('gives up after the configured number of attempts', async () => {
    const q = queue<null>({ attempts: 2, backoffDelayMs: 10 });
    let tries = 0;
    q.process(async () => {
      tries++;
      throw new Error('always fails');
    });
    await q.add('doomed', null);
    await until(() => tries === 2);
    await q.drained();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(tries).toBe(2);
  });

  it('does not retry a job that was discarded before failing', async () => {
    const q = queue<null>();
    let tries = 0;
    q.process(async (job) => {
      tries++;
      job.discard();
      throw new Error('permanent');
    });
    await q.add('permanent', null);
    await until(() => tries === 1);
    await q.drained();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(tries).toBe(1);
  });

  it('drops a job whose id is already waiting or running', async () => {
    const q = queue<string>();
    const release = gate();
    const seen: string[] = [];
    q.process(async ({ data }) => {
      seen.push(data);
      await release.opened;
    });
    await q.add('dedupe', 'first', { jobId: 'same' });
    await until(() => seen.length === 1);
    await q.add('dedupe', 'while running', { jobId: 'same' });
    release.open();
    await q.drained();
    expect(seen).toEqual(['first']);
  });

  it('accepts an id again once its job has finished', async () => {
    const q = queue<string>();
    const seen: string[] = [];
    q.process(async ({ data }) => {
      seen.push(data);
    });
    await q.add('again', 'first', { jobId: 'reused' });
    await until(() => seen.length === 1);
    await q.drained();
    await q.add('again', 'second', { jobId: 'reused' });
    await until(() => seen.length === 2);
    expect(seen).toEqual(['first', 'second']);
  });

  it('runs up to `concurrency` jobs at once', async () => {
    const q = queue<number>();
    const release = gate();
    let running = 0;
    let peak = 0;
    q.process(
      async () => {
        running++;
        peak = Math.max(peak, running);
        await release.opened;
        running--;
      },
      { concurrency: 2 }
    );
    for (let i = 0; i < 4; i++) await q.add('parallel', i);
    await until(() => running === 2);
    release.open();
    await q.drained();
    expect(peak).toBe(2);
  });

  it('drained() waits for retries as well as running jobs', async () => {
    const q = queue<null>({ attempts: 2, backoffDelayMs: 300 });
    const attempts: number[] = [];
    q.process(async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt === 1) throw new Error('retry me');
    });
    await q.add('slow-retry', null);
    await until(() => attempts.length === 1);
    await q.drained();
    expect(attempts).toEqual([1, 2]);
  });

  it('close() waits for a running job to finish', async () => {
    const q = queue<null>();
    let finished = false;
    let started = false;
    q.process(async () => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, 200));
      finished = true;
    });
    await q.add('long', null);
    await until(() => started);
    await q.close();
    expect(finished).toBe(true);
  });
});
