import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { readdir, stat, unlink } from 'node:fs/promises';
import { deleteBackup, getBackupPath, pruneOldBackups } from './backup';

// Helper: build a valid backup filename from a date string like '20240101_080000'
function makeFilename(ts: string) {
  return `business_portal_${ts}.sql`;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deleteBackup', () => {
  it('TC-009-BACKUP-08 — removes file with valid filename (happy path)', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);

    const filename = makeFilename('20240101_080000');
    await deleteBackup(filename);

    expect(unlink).toHaveBeenCalledWith(expect.stringContaining(filename));
  });

  it('TC-009-BACKUP-09 — throws for invalid filename / path traversal (error path)', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);

    await expect(deleteBackup('../etc/passwd')).rejects.toThrow('Invalid backup filename');
    await expect(deleteBackup('../../secret.sql')).rejects.toThrow('Invalid backup filename');
    await expect(deleteBackup('business_portal_abc_def.sql')).rejects.toThrow(
      'Invalid backup filename'
    );

    expect(unlink).not.toHaveBeenCalled();
  });
});

describe('getBackupPath', () => {
  it('TC-009-BACKUP-10 — returns path for valid filename, null for invalid (boundary condition)', () => {
    const validFilename = makeFilename('20240101_080000');
    const result = getBackupPath(validFilename);
    expect(result).not.toBeNull();
    expect(result).toEqual(expect.stringContaining(validFilename));

    expect(getBackupPath('../../../etc/hosts')).toBeNull();
    expect(getBackupPath('')).toBeNull();
  });
});

describe('pruneOldBackups', () => {
  // Helper: build N fake BackupInfo entries, sorted newest-first
  function makeBackupList(count: number) {
    return Array.from({ length: count }, (_, i) => {
      const day = String(count - i).padStart(2, '0');
      const filename = makeFilename(`202401${day}_080000`);
      return {
        filename,
        size: 100,
        createdAt: `2024-01-${day}T08:00:00.000Z`,
      };
    });
  }

  it('TC-009-BACKUP-11 — fewer than 14 backups: nothing deleted (boundary condition)', async () => {
    const entries = makeBackupList(13);
    vi.mocked(readdir).mockResolvedValue(
      entries.map((e) => e.filename) as unknown as Awaited<ReturnType<typeof readdir>>
    );
    vi.mocked(stat).mockResolvedValue({
      size: 100,
      mtime: new Date('2024-01-01T08:00:00Z'),
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(unlink).mockResolvedValue(undefined);

    const pruned = await pruneOldBackups();
    expect(pruned).toBe(0);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('TC-009-BACKUP-12 — exactly 14 backups: nothing deleted (boundary condition)', async () => {
    const entries = makeBackupList(14);
    vi.mocked(readdir).mockResolvedValue(
      entries.map((e) => e.filename) as unknown as Awaited<ReturnType<typeof readdir>>
    );
    vi.mocked(stat).mockResolvedValue({
      size: 100,
      mtime: new Date('2024-01-01T08:00:00Z'),
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(unlink).mockResolvedValue(undefined);

    const pruned = await pruneOldBackups();
    expect(pruned).toBe(0);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('TC-009-BACKUP-13 — 16 backups: deletes 2 oldest (happy path)', async () => {
    // Make 16 entries with distinct mtime values so sorting is deterministic.
    // index 0 = newest (20240116), index 15 = oldest (20240101)
    const entries = makeBackupList(16);

    vi.mocked(readdir).mockResolvedValue(
      entries.map((e) => e.filename) as unknown as Awaited<ReturnType<typeof readdir>>
    );

    // Map each filename to its mtime so stat returns unique values
    vi.mocked(stat).mockImplementation((filePath) => {
      const path = filePath as string;
      const match = path.match(/business_portal_(\d{8})_(\d{6})\.sql/);
      const mtime = match
        ? new Date(`2024-${match[1]!.slice(4, 6)}-${match[1]!.slice(6, 8)}T08:00:00Z`)
        : new Date();
      return Promise.resolve({ size: 100, mtime } as Awaited<ReturnType<typeof stat>>);
    });

    vi.mocked(unlink).mockResolvedValue(undefined);

    const pruned = await pruneOldBackups();
    expect(pruned).toBe(2);
    expect(unlink).toHaveBeenCalledTimes(2);

    // The two deleted files should be the oldest (entries at index 14 and 15)
    const unlinkCalls = vi.mocked(unlink).mock.calls.map(([p]) => p as string);
    expect(unlinkCalls.some((p) => p.includes(entries[14]!.filename))).toBe(true);
    expect(unlinkCalls.some((p) => p.includes(entries[15]!.filename))).toBe(true);
  });
});
