import { execFile } from 'node:child_process';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BACKUP_DIR = resolve(process.cwd(), '../../backups');
const MAX_BACKUPS = 14;

export type BackupInfo = {
  filename: string;
  size: number;
  createdAt: string;
};

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: u.username,
    password: u.password,
    database: u.pathname.slice(1),
  };
}

function sanitizeFilename(filename: string): string | null {
  if (!/^business_portal_\d{8}_\d{6}\.sql$/.test(filename)) return null;
  return filename;
}

export async function createBackup(): Promise<BackupInfo> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');

  const { host, port, user, password, database } = parseDbUrl(dbUrl);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..*/, '')
    .replace(/^(\d{8})(\d{6})$/, '$1_$2');
  const filename = `business_portal_${timestamp}.sql`;
  const filePath = join(BACKUP_DIR, filename);

  // Ensure backup dir exists
  const { mkdir } = await import('node:fs/promises');
  await mkdir(BACKUP_DIR, { recursive: true });

  await execFileAsync(
    'pg_dump',
    [
      '-h',
      host,
      '-p',
      port,
      '-U',
      user,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '-f',
      filePath,
      database,
    ],
    {
      env: { ...process.env, PGPASSWORD: password },
      timeout: 120_000,
    }
  );

  const info = await stat(filePath);
  return { filename, size: info.size, createdAt: info.mtime.toISOString() };
}

export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const files = await readdir(BACKUP_DIR);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      const info = await stat(join(BACKUP_DIR, file));
      backups.push({
        filename: file,
        size: info.size,
        createdAt: info.mtime.toISOString(),
      });
    }

    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function deleteBackup(filename: string): Promise<void> {
  const safe = sanitizeFilename(filename);
  if (!safe) throw new Error('Invalid backup filename');
  await unlink(join(BACKUP_DIR, safe));
}

export function getBackupPath(filename: string): string | null {
  const safe = sanitizeFilename(filename);
  if (!safe) return null;
  return join(BACKUP_DIR, safe);
}

export async function pruneOldBackups(): Promise<number> {
  const backups = await listBackups();
  if (backups.length <= MAX_BACKUPS) return 0;

  const toDelete = backups.slice(MAX_BACKUPS);
  for (const backup of toDelete) {
    await unlink(join(BACKUP_DIR, backup.filename));
  }
  return toDelete.length;
}
