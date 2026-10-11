import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

// execFile is called via promisify at module init, so we must hoist the mock
// and patch it as a node-style callback function.
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { readdir, stat, unlink } from 'node:fs/promises';
import { createBackup, deleteBackup, getBackupPath, listBackups, pruneOldBackups } from './backup';

// ── Constants ─────────────────────────────────────────────────────────────────

const BACKUP_DIR = resolve(process.cwd(), '../../backups');

// Helper: build a valid backup filename from a date string like '20240101_080000'
function makeFilename(ts: string) {
  return `business_portal_${ts}.sql`;
}

// Helper: make execFile resolve (calls callback with null error)
function mockExecFileSuccess() {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (err: null, stdout: string, stderr: string) => void
    ) => {
      callback(null, '', '');
    }
  );
}

// Helper: make execFile reject (calls callback with error)
function mockExecFileError(message: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, callback: (err: Error) => void) => {
      callback(new Error(message));
    }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = 'postgresql://myuser:mypassword@db-host:5433/mydb';
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createBackup', () => {
  it('TC-009-BACKUP-01 — calls pg_dump with correct arguments (happy path)', async () => {
    const { mkdir } = await import('node:fs/promises');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    mockExecFileSuccess();
    vi.mocked(stat).mockResolvedValue({
      size: 1024 * 500,
      mtime: new Date('2024-01-01T08:00:00Z'),
    } as Awaited<ReturnType<typeof stat>>);

    const info = await createBackup();

    // execFile was called with pg_dump as first arg
    expect(mockExecFile).toHaveBeenCalledWith(
      'pg_dump',
      expect.any(Array),
      expect.any(Object),
      expect.any(Function)
    );

    const [, args, opts] = mockExecFile.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
      unknown,
    ];

    // Required pg_dump flags
    expect(args).toContain('-h');
    expect(args).toContain('db-host');
    expect(args).toContain('-p');
    expect(args).toContain('5433');
    expect(args).toContain('-U');
    expect(args).toContain('myuser');
    expect(args).toContain('--clean');
    expect(args).toContain('--if-exists');
    expect(args).toContain('--no-owner');
    expect(args).toContain('--no-privileges');
    expect(args).toContain('-f');
    expect(args).toContain('mydb');

    // Output file path contains the expected prefix
    const fileArg = args[args.indexOf('-f') + 1];
    expect(fileArg).toEqual(expect.stringContaining('business_portal_'));

    // PGPASSWORD passed in env
    expect(opts.env).toMatchObject({ PGPASSWORD: 'mypassword' });

    // Returned BackupInfo
    expect(info.filename).toMatch(/^business_portal_\d{8}_\d{6}\.sql$/);
    expect(info.size).toBe(512000);
    expect(info.createdAt).toBe('2024-01-01T08:00:00.000Z');
  });

  it('TC-009-BACKUP-02 — defaults to port 5432 when URL omits port (boundary condition)', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost/dbname';

    const { mkdir } = await import('node:fs/promises');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    mockExecFileSuccess();
    vi.mocked(stat).mockResolvedValue({
      size: 100,
      mtime: new Date('2024-01-01T00:00:00Z'),
    } as Awaited<ReturnType<typeof stat>>);

    await createBackup();

    const [, args] = mockExecFile.mock.calls[0] as [string, string[], unknown, unknown];
    expect(args).toContain('-p');
    expect(args).toContain('5432');
  });

  it('TC-009-BACKUP-03 — throws when DATABASE_URL is not set (error path)', async () => {
    delete process.env.DATABASE_URL;
    await expect(createBackup()).rejects.toThrow('DATABASE_URL is not set');
  });

  it('TC-009-BACKUP-04 — propagates pg_dump failure (error path)', async () => {
    const { mkdir } = await import('node:fs/promises');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    mockExecFileError('pg_dump: could not connect');

    await expect(createBackup()).rejects.toThrow('pg_dump: could not connect');
  });
});

describe('listBackups', () => {
  it('TC-009-BACKUP-05 — returns sorted list newest-first (happy path)', async () => {
    vi.mocked(readdir).mockResolvedValue([
      'business_portal_20240103_080000.sql',
      'business_portal_20240101_080000.sql',
      'other-file.txt',
      'business_portal_20240102_080000.sql',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    vi.mocked(stat).mockImplementation((filePath) => {
      const path = filePath as string;
      if (path.includes('20240103'))
        return Promise.resolve({ size: 100, mtime: new Date('2024-01-03T08:00:00Z') } as Awaited<
          ReturnType<typeof stat>
        >);
      if (path.includes('20240102'))
        return Promise.resolve({ size: 100, mtime: new Date('2024-01-02T08:00:00Z') } as Awaited<
          ReturnType<typeof stat>
        >);
      if (path.includes('20240101'))
        return Promise.resolve({ size: 100, mtime: new Date('2024-01-01T08:00:00Z') } as Awaited<
          ReturnType<typeof stat>
        >);
      return Promise.resolve({ size: 100, mtime: new Date() } as Awaited<ReturnType<typeof stat>>);
    });

    const backups = await listBackups();

    expect(backups.length).toBe(3);
    expect(backups[0]!.filename).toBe('business_portal_20240103_080000.sql');
    expect(backups[2]!.filename).toBe('business_portal_20240101_080000.sql');

    for (const entry of backups) {
      expect(entry).toMatchObject({
        filename: expect.any(String),
        size: expect.any(Number),
        createdAt: expect.any(String),
      });
    }
  });

  it('TC-009-BACKUP-06 — returns empty array when directory does not exist (boundary condition)', async () => {
    vi.mocked(readdir).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const backups = await listBackups();
    expect(backups).toEqual([]);
  });

  it('TC-009-BACKUP-07 — propagates non-ENOENT errors (error path)', async () => {
    vi.mocked(readdir).mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    await expect(listBackups()).rejects.toMatchObject({ code: 'EACCES' });
  });
});

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
