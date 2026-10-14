import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every prompt that writes text for people uses the Australian English house
 * style (lib/ai/style.ts). Found from the source: a file that calls
 * generateText, generateObject or streamText must use AU_ENGLISH or
 * withAuEnglish, unless it's listed here with the reason.
 */
const EXEMPT: Record<string, string> = {
  'app/api/documents/[id]/clean/route.ts': "Cleans up the user's own document; keeps its spelling",
  'app/api/documents/batch/route.ts': "Batch version of clean; keeps the documents' spelling",
};

const root = join(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const callers = ['app', 'lib']
  .flatMap((dir) => sourceFiles(join(root, dir)))
  .filter((file) => /\b(generateText|generateObject|streamText)\(/.test(readFileSync(file, 'utf8')))
  .map((file) => relative(root, file));

describe('AI house style', () => {
  it('finds the AI call sites', () => {
    expect(callers.length).toBeGreaterThan(10);
  });

  it.each(callers)('%s uses the Australian English instruction', (file) => {
    if (EXEMPT[file]) return;
    expect(readFileSync(join(root, file), 'utf8')).toMatch(/\b(AU_ENGLISH|withAuEnglish)\b/);
  });

  it('only exempts files that still call the AI', () => {
    for (const file of Object.keys(EXEMPT)) expect(callers).toContain(file);
  });
});
