import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { fileParserTool } from './file-parser';

const fixture = join(__dirname, '../../../../test/fixtures/cairns-coffee-prices.csv');
const repoRoot = join(__dirname, '../../../../../..');

// An uploads directory with the fixture in it, and a secret file beside it
const scratch = mkdtempSync(join(tmpdir(), 'file-parser-'));
const uploads = join(scratch, 'uploads');
mkdirSync(join(uploads, 'research'), { recursive: true });
const csv = join(uploads, 'research', 'prices.csv');
copyFileSync(fixture, csv);
const secret = join(scratch, 'secret.csv');
writeFileSync(secret, 'key,value\nOPENAI_API_KEY,sk-not-for-the-model\n');
vi.stubEnv('UPLOADS_DIR', uploads);

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

const parse = (input: Record<string, unknown>) =>
  fileParserTool.execute?.(input as never, {} as never);

const refused = {
  content: 'Parse failed: File is outside the uploads directory',
  metadata: { error: 'File is outside the uploads directory' },
};

describe('file-parser tool', () => {
  it('turns a CSV into one record per row, keyed by the header', async () => {
    const result = await parse({ filePath: csv, fileType: 'csv' });

    expect(result).toEqual({ content: expect.any(String), metadata: { rows: 3 } });
    expect(JSON.parse((result as { content: string }).content)).toEqual([
      {
        cafe: 'Harbourside Roasters',
        suburb: 'Cairns City',
        flat_white_aud: '5.20',
        opened: '2019',
      },
      { cafe: 'Esplanade Espresso', suburb: 'Cairns City', flat_white_aud: '5.50', opened: '2021' },
      {
        cafe: 'Edge Hill Coffee, Co.',
        suburb: 'Edge Hill',
        flat_white_aud: '4.90',
        opened: '2016',
      },
    ]);
  });

  it('reads a path relative to the uploads directory', async () => {
    const result = await parse({ filePath: 'research/prices.csv', fileType: 'csv' });
    expect(result).toMatchObject({ metadata: { rows: 3 } });
  });

  it('reports a missing upload as a parse failure instead of throwing', async () => {
    const result = await parse({ filePath: join(uploads, 'no-such-file.csv'), fileType: 'csv' });

    expect(result).toEqual({
      content: expect.stringMatching(/^Parse failed: ENOENT/),
      metadata: { error: expect.stringContaining('ENOENT') },
    });
  });

  it('refuses the repo’s .env.docker', async () => {
    const result = await parse({ filePath: join(repoRoot, '.env.docker'), fileType: 'csv' });
    expect(result).toEqual(refused);
  });

  it('refuses a path that climbs out of the uploads directory with ..', async () => {
    expect(await parse({ filePath: '../secret.csv', fileType: 'csv' })).toEqual(refused);
    expect(
      await parse({
        filePath: join(uploads, 'research', '..', '..', 'secret.csv'),
        fileType: 'csv',
      })
    ).toEqual(refused);
  });

  it('refuses a symlink inside the uploads directory that points outside it', async () => {
    const link = join(uploads, 'research', 'innocent.csv');
    symlinkSync(secret, link);
    const linkedDir = join(uploads, 'linked');
    symlinkSync(scratch, linkedDir);

    expect(await parse({ filePath: link, fileType: 'csv' })).toEqual(refused);
    expect(await parse({ filePath: join(linkedDir, 'secret.csv'), fileType: 'csv' })).toEqual(
      refused
    );
  });

  it('refuses a file type it does not handle', async () => {
    const result = await parse({ filePath: csv, fileType: 'xlsx' });

    expect(result).toMatchObject({ error: true, message: expect.stringContaining('fileType') });
  });
});
