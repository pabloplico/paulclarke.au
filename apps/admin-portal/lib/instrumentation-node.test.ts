import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which workers start at boot, in order. Demo mode starts only the two queues
 * the demo uses, with no research-agent workers. Recovery runs last, once the
 * workers are registered.
 */
const started = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock('./startup-checks', () => ({ runStartupChecks: () => {} }));
vi.mock('./queue/recover', () => ({
  recoverInterruptedJobs: async () => {
    started.names.push('recovery');
    return {};
  },
}));
vi.mock('./agents/queue/init', () => ({
  startAgentQueues: () => {
    started.names.push('research-agents');
  },
}));

beforeEach(() => {
  vi.resetModules();
  started.names = [];
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
});

describe('registerNode', () => {
  it('starts every worker, then recovers interrupted work', async () => {
    delete process.env.DEMO_MODE;
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    expect(started.names).toEqual([
      'document-processing',
      'workspace-routing',
      'research-agents',
      'recovery',
    ]);
  });

  it('starts no research-agent workers in demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    expect(started.names).toEqual(['document-processing', 'workspace-routing', 'recovery']);
    delete process.env.DEMO_MODE;
  });

  it('readies PGlite before any worker starts', async () => {
    delete process.env.DEMO_MODE;
    process.env.DB_DRIVER = 'pglite';
    vi.doMock('./db/pglite', () => ({
      ensurePgliteReady: async () => {
        started.names.push('pglite');
      },
    }));
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
    expect(started.names[0]).toBe('pglite');
  });
});
