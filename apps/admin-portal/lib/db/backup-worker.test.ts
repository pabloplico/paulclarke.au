import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { capturedProcessor, mockUpsertJobScheduler } = vi.hoisted(() => {
  const capturedProcessor = { current: null as null | ((job: unknown) => Promise<unknown>) };
  const mockUpsertJobScheduler = vi.fn();

  return { capturedProcessor, mockUpsertJobScheduler };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    on: vi.fn(),
  })),
  Worker: vi.fn((_name: string, processor: (job: unknown) => Promise<unknown>, _opts: unknown) => {
    capturedProcessor.current = processor;
    return { on: vi.fn() };
  }),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

vi.mock('./backup', () => ({
  createBackup: vi.fn(),
  pruneOldBackups: vi.fn(),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedProcessor.current = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('backup-worker', () => {
  it('TC-009-WORKER-01 — Worker and scheduler registered on import (happy path)', async () => {
    vi.resetModules();
    await import('./backup-worker');

    const { Queue, Worker } = await import('bullmq');

    // Queue created with correct name
    expect(Queue).toHaveBeenCalledWith('db-backup', expect.any(Object));

    // Scheduler configured with correct cron pattern
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      'db-backup-schedule',
      { pattern: '0 8,20 * * *' },
      { name: 'scheduled-backup' }
    );

    // Worker registered on the same queue with concurrency 1
    expect(Worker).toHaveBeenCalledWith(
      'db-backup',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    );

    expect(capturedProcessor.current).toBeDefined();
  });

  it('TC-009-WORKER-02 — Processor calls createBackup then pruneOldBackups, returns backup info (happy path)', async () => {
    vi.resetModules();

    const backupInfo = {
      filename: 'business_portal_20240101_080000.sql',
      size: 1048576,
      createdAt: '2024-01-01T08:00:00.000Z',
    };

    const { createBackup, pruneOldBackups } = await import('./backup');
    vi.mocked(createBackup).mockResolvedValue(backupInfo);
    vi.mocked(pruneOldBackups).mockResolvedValue(0);

    await import('./backup-worker');
    const processor = capturedProcessor.current!;

    const result = await processor({ id: 'job-1' });

    expect(createBackup).toHaveBeenCalledOnce();
    expect(pruneOldBackups).toHaveBeenCalledOnce();

    // pruneOldBackups called after createBackup
    const createOrder = vi.mocked(createBackup).mock.invocationCallOrder[0]!;
    const pruneOrder = vi.mocked(pruneOldBackups).mock.invocationCallOrder[0]!;
    expect(pruneOrder).toBeGreaterThan(createOrder);

    expect(result).toEqual(backupInfo);
  });

  it('TC-009-WORKER-03 — Processor propagates createBackup failure (error path)', async () => {
    vi.resetModules();

    const { createBackup, pruneOldBackups } = await import('./backup');
    vi.mocked(createBackup).mockRejectedValue(new Error('pg_dump failed'));

    await import('./backup-worker');
    const processor = capturedProcessor.current!;

    await expect(processor({ id: 'job-2' })).rejects.toThrow('pg_dump failed');

    expect(pruneOldBackups).not.toHaveBeenCalled();
  });

  it('TC-009-WORKER-04 — pruneOldBackups failure propagates (error path)', async () => {
    vi.resetModules();

    const backupInfo = {
      filename: 'business_portal_20240101_080000.sql',
      size: 1048576,
      createdAt: '2024-01-01T08:00:00.000Z',
    };

    const { createBackup, pruneOldBackups } = await import('./backup');
    vi.mocked(createBackup).mockResolvedValue(backupInfo);
    vi.mocked(pruneOldBackups).mockRejectedValue(new Error('unlink failed'));

    await import('./backup-worker');
    const processor = capturedProcessor.current!;

    await expect(processor({ id: 'job-3' })).rejects.toThrow('unlink failed');
  });
});
