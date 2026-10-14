import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which workers start at boot. Demo mode on BullMQ (the managed Postgres +
 * Redis fallback) must still start only the two queues the demo uses: no
 * backup, feed or research-agent workers, and no cron schedules.
 */
const started = vi.hoisted(() => ({ names: [] as string[], schedules: 0 }));

vi.mock('./startup-checks', () => ({ runStartupChecks: () => {} }));
vi.mock('./document-processing/worker', () => {
  started.names.push('document-processing');
  return {};
});
vi.mock('./workspace-routing/worker', () => {
  started.names.push('workspace-routing');
  return {};
});
vi.mock('./queue/recover', () => ({ recoverInterruptedJobs: async () => ({}) }));
vi.mock('./db/backup-worker', () => ({
  startBackupWorker: () => {
    started.names.push('backups');
    started.schedules++;
  },
}));
vi.mock('./feeds/worker', () => ({
  startFeedWorker: () => {
    started.names.push('feeds');
    started.schedules++;
  },
}));
vi.mock('./agents/queue/init', () => ({
  startAgentQueues: () => {
    started.names.push('research-agents');
    started.schedules++;
  },
}));

beforeEach(() => {
  vi.resetModules();
  started.names = [];
  started.schedules = 0;
  process.env.DB_DRIVER = 'postgres';
  process.env.QUEUE_DRIVER = 'bullmq';
});

describe('registerNode', () => {
  it('starts every worker in development on BullMQ', async () => {
    delete process.env.DEMO_MODE;
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    expect(started.names).toEqual([
      'document-processing',
      'workspace-routing',
      'backups',
      'feeds',
      'research-agents',
    ]);
  });

  it('starts no backup, feed or research-agent workers in demo mode, even on BullMQ', async () => {
    process.env.DEMO_MODE = 'true';
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    // (vitest runs a mock factory once, so the two queue workers' import is
    // recorded only by the first test; this one checks nothing else starts)
    expect(started.names).not.toContain('backups');
    expect(started.names).not.toContain('feeds');
    expect(started.names).not.toContain('research-agents');
    expect(started.schedules).toBe(0);
    delete process.env.DEMO_MODE;
  });
});
