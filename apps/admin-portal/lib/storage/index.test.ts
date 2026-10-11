import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorage } from './index';

describe('LocalStorage path traversal protection', () => {
  let testDir: string;
  let storage: LocalStorage;

  beforeEach(() => {
    testDir = join(tmpdir(), `storage-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    storage = new LocalStorage(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('save()', () => {
    it('saves a file with a normal filename', async () => {
      const path = await storage.save('report.pdf', Buffer.from('hello'));
      expect(path).toBe(join(testDir, 'report.pdf'));
      expect(readFileSync(path, 'utf-8')).toBe('hello');
    });

    it('saves a file in a subdirectory', async () => {
      mkdirSync(join(testDir, '2024'), { recursive: true });
      const path = await storage.save('2024/report.pdf', Buffer.from('data'));
      expect(path).toBe(join(testDir, '2024', 'report.pdf'));
    });

    it('rejects path traversal with ../', async () => {
      await expect(storage.save('../../etc/passwd', Buffer.from('evil'))).rejects.toThrow(
        'Path traversal detected'
      );
    });

    it('rejects path traversal with backtrack', async () => {
      await expect(storage.save('subdir/../../../etc/shadow', Buffer.from('evil'))).rejects.toThrow(
        'Path traversal detected'
      );
    });

    it('allows filenames with .. in the name (not traversal)', async () => {
      const path = await storage.save('report..final.pdf', Buffer.from('ok'));
      expect(path).toBe(join(testDir, 'report..final.pdf'));
    });
  });

  describe('read()', () => {
    it('reads a file within baseDir by absolute path', async () => {
      const savedPath = await storage.save('test.txt', Buffer.from('content'));
      const data = await storage.read(savedPath);
      expect(data.toString()).toBe('content');
    });

    it('rejects absolute path outside baseDir', async () => {
      await expect(storage.read('/etc/passwd')).rejects.toThrow('Path traversal detected');
    });

    it('rejects relative traversal path', async () => {
      await expect(storage.read('../../etc/passwd')).rejects.toThrow('Path traversal detected');
    });
  });

  describe('remove()', () => {
    it('removes a file within baseDir', async () => {
      const savedPath = await storage.save('to-delete.txt', Buffer.from('bye'));
      await storage.remove(savedPath);
      expect(existsSync(savedPath)).toBe(false);
    });

    it('rejects absolute path outside baseDir', async () => {
      await expect(storage.remove('/etc/passwd')).rejects.toThrow('Path traversal detected');
    });

    it('rejects relative traversal path', async () => {
      await expect(storage.remove('../../etc/passwd')).rejects.toThrow('Path traversal detected');
    });
  });
});
