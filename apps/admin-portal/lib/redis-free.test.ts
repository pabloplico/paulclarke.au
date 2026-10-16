import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * With DB_DRIVER=pglite and QUEUE_DRIVER=memory, nothing may open a Redis
 * connection: not at import, not on boot, and not when a Redis-only feature
 * is reached. Every module below opened one at import time before the
 * drivers work (next build logged ECONNREFUSED 6379 for each).
 */
process.env.DB_DRIVER = 'pglite';
process.env.QUEUE_DRIVER = 'memory';
process.env.NEXT_RUNTIME = 'nodejs';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const opened = vi.hoisted(() => ({ ioredis: 0, queues: 0, workers: 0 }));
vi.mock('ioredis', () => ({
  default: vi.fn(() => {
    opened.ioredis++;
    throw new Error('a Redis connection was opened');
  }),
}));
vi.mock('bullmq', () => ({
  Queue: vi.fn(() => {
    opened.queues++;
    throw new Error('a BullMQ Queue was created');
  }),
  Worker: vi.fn(() => {
    opened.workers++;
    throw new Error('a BullMQ Worker was created');
  }),
}));

const modules = [
  '@/lib/document-processing/queue',
  '@/lib/document-processing/worker',
  '@/lib/workspace-routing/queue',
  '@/lib/workspace-routing/worker',
  '@/lib/agents/queue/research-queue',
  '@/lib/agents/queue/ingestion-queue',
  '@/lib/agents/queue/analysis-queue',
  '@/lib/agents/queue/run-logger',
  '@/lib/agents/queue/trigger',
  '@/lib/agents/queue/init',
  '@/app/api/workspaces/[id]/research/agent-runs/[runId]/cancel/route',
];

afterAll(async () => {
  const { getPglite } = await import('@/lib/db/pglite');
  await getPglite().close();
});

describe('demo drivers (pglite + memory) never touch Redis', () => {
  it('importing every module that used to connect opens nothing', async () => {
    for (const path of modules) await import(path);
    expect(opened).toEqual({ ioredis: 0, queues: 0, workers: 0 });
  }, 30_000);

  it('booting through instrumentation opens nothing', async () => {
    const { register } = await import('@/instrumentation');
    await register();
    expect(opened).toEqual({ ioredis: 0, queues: 0, workers: 0 });
  }, 30_000);

  it('writing an agent log entry opens no connection', async () => {
    const { publishRunLog } = await import('@/lib/agents/queue/run-logger');
    await publishRunLog(1, 'a log entry');
    expect(opened.ioredis).toBe(0);
  });

  it('asking for Redis fails loudly instead of connecting', async () => {
    const { getRedis } = await import('@/lib/redis');
    expect(() => getRedis('Shared rate limiting')).toThrow(
      'needs Redis, which is off (QUEUE_DRIVER=memory)'
    );
    expect(opened).toEqual({ ioredis: 0, queues: 0, workers: 0 });
  });
});
