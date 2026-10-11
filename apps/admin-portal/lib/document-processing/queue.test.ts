import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdd = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: mockAdd })),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  config: {
    queue: {
      documentProcessing: {
        attempts: 3,
        backoffDelay: 5000,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('queueDocument', () => {
  async function getModule() {
    vi.resetModules();
    return import('./queue');
  }

  it('adds a job with document ID', async () => {
    const { queueDocument } = await getModule();
    await queueDocument(42);

    expect(mockAdd).toHaveBeenCalledWith(
      'process-document',
      { documentId: 42 },
      { jobId: 'doc-42' }
    );
  });

  it('uses timestamp-based job ID when force=true', async () => {
    const { queueDocument } = await getModule();
    await queueDocument(42, true);

    expect(mockAdd).toHaveBeenCalledWith(
      'process-document',
      { documentId: 42 },
      { jobId: expect.stringMatching(/^doc-42-\d+$/) }
    );
  });
});
