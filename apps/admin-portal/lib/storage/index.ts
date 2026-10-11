import { existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export interface StorageProvider {
  save(filename: string, data: Buffer): Promise<string>;
  read(filePath: string): Promise<Buffer>;
  remove(filePath: string): Promise<void>;
}

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');

export class LocalStorage implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string = UPLOADS_DIR) {
    this.baseDir = resolve(baseDir);
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Resolve a filename/path and verify it stays within baseDir.
   * Throws if the resolved path escapes the base directory.
   */
  private safePath(filePathOrName: string): string {
    const resolved = resolve(this.baseDir, filePathOrName);
    if (!resolved.startsWith(this.baseDir + sep) && resolved !== this.baseDir) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async save(filename: string, data: Buffer): Promise<string> {
    const filePath = this.safePath(filename);
    await writeFile(filePath, data);
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    const safed = this.safePath(filePath);
    return readFile(safed);
  }

  async remove(filePath: string): Promise<void> {
    const safed = this.safePath(filePath);
    await unlink(safed);
  }
}

export const storage = new LocalStorage();
