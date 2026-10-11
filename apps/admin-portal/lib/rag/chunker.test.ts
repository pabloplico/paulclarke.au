import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

describe('chunkText', () => {
  it('returns empty array for blank input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('splits by heading sections', () => {
    const input = '# Intro\nSome intro text\n\n# Details\nDetailed content here';
    const chunks = chunkText(input, { chunkSize: 5000 });
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.metadata.sectionHeading).toBe('Intro');
    expect(chunks[1]?.metadata.sectionHeading).toBe('Details');
  });

  it('preserves code blocks as separate chunks', () => {
    const input = '# Code\nSome text\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\nMore text';
    const chunks = chunkText(input, { chunkSize: 5000 });
    const codeChunk = chunks.find((c) => c.metadata.contentType === 'code');
    expect(codeChunk).toBeDefined();
    expect(codeChunk?.content).toContain('const x = 1');
  });

  it('detects markdown tables', () => {
    const input = '# Data\n| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |';
    const chunks = chunkText(input, { chunkSize: 5000 });
    const tableChunk = chunks.find((c) => c.metadata.contentType === 'table');
    expect(tableChunk).toBeDefined();
    expect(tableChunk?.content).toContain('| Name | Value |');
  });

  // ── GAP-015: Exact content checks ────────────────────────────────────────

  it('TC-015-A1: single short chunk has exact content equal to trimmed input', () => {
    const chunks = chunkText('Just a sentence.', { chunkSize: 5000, overlap: 0 });
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.content).toBe('Just a sentence.');
  });

  it('TC-015-A2: code fence block content preserves opening and closing fence markers exactly', () => {
    const input = '# Code\n```js\nconst x = 1;\n```';
    const chunks = chunkText(input, { chunkSize: 5000, overlap: 0 });
    const codeChunk = chunks.find((c) => c.metadata.contentType === 'code');
    expect(codeChunk).toBeDefined();
    expect(codeChunk?.content).toBe('```js\nconst x = 1;\n```');
  });

  it('TC-015-A3: markdown table chunk contains all rows including separator exactly', () => {
    const input = '# Data\n| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |';
    const chunks = chunkText(input, { chunkSize: 5000, overlap: 0 });
    const tableChunk = chunks.find((c) => c.metadata.contentType === 'table');
    expect(tableChunk).toBeDefined();
    expect(tableChunk?.content).toBe('| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |');
  });

  it('TC-015-A4: text before first heading forms a chunk with undefined sectionHeading', () => {
    const input = 'Preamble paragraph\n# Section';
    const chunks = chunkText(input, { chunkSize: 5000, overlap: 0 });
    expect(chunks[0]?.metadata.sectionHeading).toBeUndefined();
  });

  it('TC-015-B1: splitLargeText splits at last paragraph break before chunk boundary', () => {
    // 200 A's + double newline + 200 B's = 404 chars total, chunkSize 300
    const text = `${'A'.repeat(200)}\n\n${'B'.repeat(200)}`;
    const chunks = chunkText(text, { chunkSize: 300, overlap: 0 });
    // The first chunk should end at the paragraph break (the A's), not mid-B's
    expect(chunks[0]?.content).toBe('A'.repeat(200));
  });

  it('TC-015-B2: splitLargeText splits at sentence boundaries when no paragraph break in first half', () => {
    const sentence =
      'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. ';
    const text = sentence.repeat(5);
    const chunks = chunkText(text, { chunkSize: 80, overlap: 0 });
    // All non-final chunks should end with '.' (sentence boundary)
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i]?.content).toMatch(/\.$/);
    }
  });

  it('TC-015-B3: chunk index sequence is correct after oversized code block forces a flush', () => {
    // prose + large code block + more prose
    const largeCode = `\`\`\`js\n${'x'.repeat(2000)}\n\`\`\``;
    const input = `Intro prose.\n\n${largeCode}\n\nFollowing prose.`;
    const chunks = chunkText(input, { chunkSize: 1000, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('TC-015-B4: H2 heading after H1 does not carry the H1 heading text as sectionHeading', () => {
    const input = '# Top\n## Sub\nContent';
    const chunks = chunkText(input, { chunkSize: 5000, overlap: 0 });
    const subChunk = chunks.find((c) => c.metadata.sectionHeading === 'Sub');
    expect(subChunk).toBeDefined();
    expect(subChunk?.metadata.sectionHeading).toBe('Sub');
    expect(subChunk?.metadata.sectionHeading).not.toBe('Top');
  });

  it('TC-015-B5: pageRange is undefined on chunks from single-page text', () => {
    const input = 'Some text without form feeds';
    const chunks = chunkText(input, { chunkSize: 5000, overlap: 0 });
    expect(chunks[0]?.metadata.pageRange).toBeUndefined();
  });

  it('splits long text at paragraph boundaries', () => {
    const para = 'This is a sentence. '.repeat(30); // ~600 chars
    const input = `${para}\n\n${para}`;
    const chunks = chunkText(input, { chunkSize: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(700);
    }
  });

  it('assigns sequential chunk indices', () => {
    const input = '# A\nText A\n\n# B\nText B\n\n# C\nText C';
    const chunks = chunkText(input, { chunkSize: 5000 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.index).toBe(i);
    }
  });

  // ── New tests for heading ancestry ───────────────────────────────────────

  it('tracks heading ancestry for nested headings', () => {
    const input = '# Report\n## Finance\n### Q3\nRevenue grew.\n### Q4\nRevenue flat.';
    const chunks = chunkText(input, { chunkSize: 5000 });

    const q3Chunk = chunks.find((c) => c.metadata.sectionHeading === 'Q3');
    const q4Chunk = chunks.find((c) => c.metadata.sectionHeading === 'Q4');

    expect(q3Chunk?.metadata.headingPath).toEqual(['Report', 'Finance', 'Q3']);
    expect(q4Chunk?.metadata.headingPath).toEqual(['Report', 'Finance', 'Q4']);
  });

  it('resets heading ancestry at same level', () => {
    const input = '# A\n## B\nText B\n## C\nText C';
    const chunks = chunkText(input, { chunkSize: 5000 });

    const chunkB = chunks.find((c) => c.metadata.sectionHeading === 'B');
    const chunkC = chunks.find((c) => c.metadata.sectionHeading === 'C');

    expect(chunkB?.metadata.headingPath).toEqual(['A', 'B']);
    expect(chunkC?.metadata.headingPath).toEqual(['A', 'C']);
  });

  it('provides empty headingPath for content before any heading', () => {
    const input = 'Some preamble text\n# First Heading\nContent';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks[0]?.metadata.headingPath).toEqual([]);
    expect(chunks[1]?.metadata.headingPath).toEqual(['First Heading']);
  });

  // ── New tests for totalChunks ────────────────────────────────────────────

  it('sets totalChunks on all chunks', () => {
    const input = '# A\nText A\n# B\nText B\n# C\nText C';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks.length).toBe(3);
    for (const chunk of chunks) {
      expect(chunk.metadata.totalChunks).toBe(3);
    }
  });

  // ── New tests for contentHash ────────────────────────────────────────────

  it('generates valid SHA-256 contentHash', () => {
    const input = '# Test\nSome content here';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks[0]?.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces deterministic contentHash for same input', () => {
    const input = '# Test\nSome content here';
    const chunks1 = chunkText(input, { chunkSize: 5000 });
    const chunks2 = chunkText(input, { chunkSize: 5000 });

    expect(chunks1[0]?.metadata.contentHash).toBe(chunks2[0]?.metadata.contentHash);
  });

  it('produces different contentHash for different content', () => {
    const input = '# A\nContent A\n# B\nContent B';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks[0]?.metadata.contentHash).not.toBe(chunks[1]?.metadata.contentHash);
  });

  // ── New tests for startOffset and endOffset ──────────────────────────────

  it('populates startOffset and endOffset on all chunks', () => {
    const input = '# A\nFirst chunk text\n# B\nSecond chunk text';
    const chunks = chunkText(input, { chunkSize: 5000 });

    for (const chunk of chunks) {
      expect(chunk.metadata.startOffset).toBeDefined();
      expect(chunk.metadata.endOffset).toBeDefined();
      expect(chunk.metadata.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.endOffset!).toBeGreaterThan(chunk.metadata.startOffset!);
    }
  });

  it('first chunk of document without heading starts at offset 0', () => {
    const input = 'Just plain text without any headings.';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks[0]?.metadata.startOffset).toBe(0);
  });

  // ── New tests for page range with overlapping chunks (ISSUE-010) ────────

  it('assigns correct page ranges for overlapping chunks across page breaks', () => {
    // Build text: 400 chars on page 1, form feed, 400 chars on page 2
    const page1 = 'A'.repeat(400);
    const page2 = 'B'.repeat(400);
    const input = `${page1}\f${page2}`;

    const chunks = chunkText(input, { chunkSize: 400, overlap: 200 });

    // First chunk should be page 1
    expect(chunks[0]?.metadata.pageRange).toBe('1');

    // Later chunks that include page 2 content should reference page 2
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk?.metadata.pageRange).toMatch(/2/);
  });

  it('handles multiple page breaks with overlapping chunks', () => {
    const page = 'X'.repeat(300);
    const input = `${page}\f${page}\f${page}`;

    const chunks = chunkText(input, { chunkSize: 250, overlap: 100 });

    // Verify we get multiple chunks
    expect(chunks.length).toBeGreaterThan(1);

    // All chunks should have valid page ranges
    for (const chunk of chunks) {
      if (chunk.metadata.pageRange) {
        expect(chunk.metadata.pageRange).toMatch(/^\d+(-\d+)?$/);
      }
    }
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('handles single chunk document', () => {
    const input = 'Short text';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.metadata.totalChunks).toBe(1);
    expect(chunks[0]?.metadata.contentHash).toBeDefined();
    expect(chunks[0]?.metadata.startOffset).toBe(0);
    expect(chunks[0]?.metadata.endOffset).toBe(10);
  });

  it('handles document with no headings', () => {
    const input = 'Just a plain paragraph of text without any markdown headings.';
    const chunks = chunkText(input, { chunkSize: 5000 });

    for (const chunk of chunks) {
      expect(chunk.metadata.headingPath).toEqual([]);
    }
  });

  it('handles non-ASCII content correctly', () => {
    const input = '# Ubersicht\nDies ist ein Test mit Umlauten: a, o, u, ss.';
    const chunks = chunkText(input, { chunkSize: 5000 });

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(chunks[0]?.metadata.startOffset).toBeDefined();
    expect(chunks[0]?.metadata.endOffset).toBeDefined();
  });

  it('handles oversized single block with correct metadata', () => {
    const input = `# Big\n${'x'.repeat(3000)}`;
    const chunks = chunkText(input, { chunkSize: 1000, overlap: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.metadata.headingPath).toEqual(['Big']);
      expect(chunk.metadata.sectionHeading).toBe('Big');
      expect(chunk.metadata.totalChunks).toBe(chunks.length);
    }
  });

  it('handles binary-like content without crashes', () => {
    const input = 'a'.repeat(2500);
    const chunks = chunkText(input, { chunkSize: 1000, overlap: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.metadata.startOffset).toBeDefined();
      expect(chunk.metadata.endOffset).toBeDefined();
    }
  });
});
