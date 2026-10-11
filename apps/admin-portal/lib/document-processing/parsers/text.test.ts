import { describe, expect, it } from 'vitest';
import { parseText } from './text';

describe('parseText', () => {
  it('extracts plain text from buffer', async () => {
    const result = await parseText(Buffer.from('Hello, world!'), 'test.txt');
    expect(result.text).toBe('Hello, world!');
  });

  it('strips UTF-8 BOM', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from('Clean text');
    const result = await parseText(Buffer.concat([bom, content]), 'test.txt');
    expect(result.text).toBe('Clean text');
  });
});
