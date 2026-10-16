import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileParserTool } from './file-parser';

const fixture = join(__dirname, '../../../../test/fixtures/cairns-coffee-prices.csv');

const parse = (input: Record<string, unknown>) =>
  fileParserTool.execute?.(input as never, {} as never);

describe('file-parser tool', () => {
  it('turns a CSV into one record per row, keyed by the header', async () => {
    const result = await parse({ filePath: fixture, fileType: 'csv' });

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

  it('reports a missing file as a parse failure instead of throwing', async () => {
    const result = await parse({ filePath: join(__dirname, 'no-such-file.csv'), fileType: 'csv' });

    expect(result).toEqual({
      content: expect.stringMatching(/^Parse failed: ENOENT/),
      metadata: { error: expect.stringContaining('ENOENT') },
    });
  });

  it('refuses a file type it does not handle', async () => {
    const result = await parse({ filePath: fixture, fileType: 'xlsx' });

    expect(result).toMatchObject({ error: true, message: expect.stringContaining('fileType') });
  });
});
