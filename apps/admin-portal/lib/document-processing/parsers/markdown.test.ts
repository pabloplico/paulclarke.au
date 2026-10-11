import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('extracts frontmatter metadata', async () => {
    const md = '---\ntitle: Test Doc\nauthor: Alice\n---\n# Hello\nContent here';
    const result = await parseMarkdown(Buffer.from(md), 'test.md');
    expect(result.metadata).toEqual(
      expect.objectContaining({
        hasFrontmatter: true,
        title: 'Test Doc',
        author: 'Alice',
      })
    );
    expect(result.text).toContain('# Hello');
  });

  it('handles markdown without frontmatter', async () => {
    const md = '# Just a Heading\nSome content';
    const result = await parseMarkdown(Buffer.from(md), 'test.md');
    expect(result.metadata).toBeUndefined();
    expect(result.text).toContain('# Just a Heading');
  });

  it('strips UTF-8 BOM', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from('# Title');
    const result = await parseMarkdown(Buffer.concat([bom, content]), 'test.md');
    expect(result.text).toBe('# Title');
  });
});
