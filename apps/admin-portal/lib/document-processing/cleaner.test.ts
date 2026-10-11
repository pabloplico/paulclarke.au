import { describe, expect, it } from 'vitest';
import { cleanText } from './cleaner';

describe('cleanText', () => {
  it('strips repeated headers and footers across pages', () => {
    const input = [
      'Company Report\nActual content page 1\nPage Footer',
      'Company Report\nActual content page 2\nPage Footer',
      'Company Report\nActual content page 3\nPage Footer',
    ].join('\f');

    const result = cleanText(input);
    // Header/footer appear on >50% pages — should be stripped
    expect(result).not.toContain('Company Report');
    expect(result).not.toContain('Page Footer');
    expect(result).toContain('Actual content page 1');
    expect(result).toContain('Actual content page 2');
  });

  it('strips standalone page numbers', () => {
    const input = 'Some text\n  42  \nMore text\nPage 3 of 10\n- 5 -\nEnd';
    const result = cleanText(input);
    expect(result).not.toMatch(/^\s*42\s*$/m);
    expect(result).not.toMatch(/Page 3 of 10/);
    expect(result).not.toMatch(/- 5 -/);
    expect(result).toContain('Some text');
    expect(result).toContain('More text');
  });

  it('normalizes whitespace and smart quotes', () => {
    const input = 'He said \u201CHello\u201D and it\u2019s fine\u2014really';
    const result = cleanText(input);
    expect(result).toContain('"Hello"');
    expect(result).toContain("it's fine--really");
  });

  it('deduplicates short repeated paragraphs', () => {
    const input = 'Disclaimer: confidential\n\nSome real content\n\nDisclaimer: confidential';
    const result = cleanText(input);
    const matches = result.match(/Disclaimer: confidential/g);
    expect(matches).toHaveLength(1);
  });

  it('converts ALL CAPS lines to markdown headings', () => {
    const input = 'EXECUTIVE SUMMARY\nThis report covers...';
    const result = cleanText(input);
    expect(result).toContain('## Executive summary');
  });

  it('collapses excessive blank lines', () => {
    const input = 'Para 1\n\n\n\n\nPara 2';
    const result = cleanText(input);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain('Para 1');
    expect(result).toContain('Para 2');
  });
});
