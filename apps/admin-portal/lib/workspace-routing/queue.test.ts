import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

// Must be hoisted because routingQueue is created at module scope in queue.ts
const mockQueueAdd = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@/lib/queue', () => ({
  createJobQueue: vi.fn(() => ({ add: mockQueueAdd })),
}));

vi.mock('@/lib/config', () => ({
  config: {
    queue: {
      routing: {
        attempts: 3,
        backoffDelay: 5000,
      },
    },
  },
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('queueRouting', () => {
  async function getModule() {
    vi.resetModules();
    return import('./queue');
  }

  it('TC-024 — happy path: enqueues job with correct name, payload, and jobId', async () => {
    const { queueRouting } = await getModule();
    await queueRouting(42);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'route-material',
      { inboxItemId: 42 },
      { jobId: 'route-42' }
    );
  });

  it('TC-025 — boundary: different IDs produce unique jobIds with no collision', async () => {
    const { queueRouting } = await getModule();

    await queueRouting(1);
    await queueRouting(100);

    expect(mockQueueAdd).toHaveBeenCalledTimes(2);

    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      1,
      'route-material',
      { inboxItemId: 1 },
      { jobId: 'route-1' }
    );
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      2,
      'route-material',
      { inboxItemId: 100 },
      { jobId: 'route-100' }
    );
  });

  it('creates the workspace-routing queue with the configured retry policy', async () => {
    await getModule();

    const { createJobQueue } = await import('@/lib/queue');
    expect(createJobQueue).toHaveBeenCalledWith('workspace-routing', {
      attempts: 3,
      backoffDelayMs: 5000,
    });
  });
});
