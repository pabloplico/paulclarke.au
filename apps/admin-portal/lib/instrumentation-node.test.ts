import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which workers start at boot. Demo mode on BullMQ (the managed Postgres +
 * Redis fallback) must still start only the two queues the demo uses: no
 * research-agent workers and no cron schedules.
 */
const started = vi.hoisted(() => ({ names: [] as string[], schedules: 0 }));

vi.mock('./startup-checks', () => ({ runStartupChecks: () => {} }));
vi.mock('./queue/recover', () => ({ recoverInterruptedJobs: async () => ({}) }));
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
  // The two queue workers start as a side effect of being imported. vi.mock
  // runs its factory only once per file, so these are registered again for
  // each test (vi.doMock, after resetModules) and every test sees its imports
  vi.doMock('./document-processing/worker', () => {
    started.names.push('document-processing');
    return {};
  });
  vi.doMock('./workspace-routing/worker', () => {
    started.names.push('workspace-routing');
    return {};
  });
  process.env.DB_DRIVER = 'postgres';
  process.env.QUEUE_DRIVER = 'bullmq';
});

describe('registerNode', () => {
  it('starts every worker in development on BullMQ', async () => {
    delete process.env.DEMO_MODE;
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    expect(started.names).toEqual(['document-processing', 'workspace-routing', 'research-agents']);
  });

  it('starts no research-agent workers in demo mode, even on BullMQ', async () => {
    process.env.DEMO_MODE = 'true';
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    expect(started.names).toEqual(['document-processing', 'workspace-routing']);
    expect(started.schedules).toBe(0);
    delete process.env.DEMO_MODE;
  });
});
