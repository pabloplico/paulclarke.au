import { describe, expect, it } from 'vitest';
import { extractCitations, restoreCitations, verifyCitationPresence } from './citations';

describe('extractCitations', () => {
  it('extracts DOI citations', () => {
    const text = 'The study found results (10.1038/s41586-023-06647-8) supporting the hypothesis.';
    const { citations, annotatedText } = extractCitations(text, 1);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.type).toBe('doi');
    expect(citations[0]!.rawMarker).toBe('10.1038/s41586-023-06647-8');
    expect(annotatedText).toContain('{{cite:DOC1-REF0}}');
    expect(annotatedText).not.toContain('10.1038');
  });

  it('extracts URL citations', () => {
    const text = 'See the docs at https://example.com/docs/api#section for details.';
    const { citations } = extractCitations(text, 1);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.type).toBe('url');
    expect(citations[0]!.url).toBe('https://example.com/docs/api#section');
  });

  it('extracts and correlates numbered references', () => {
    const text =
      'AI is accelerating [1] across industries [2].\n\n[1] Smith, J. (2024). AI Trends.\n[2] Lee, K. (2023). Industry Report.';
    const { citations, annotatedText } = extractCitations(text, 1);

    const numbered = citations.filter((c) => c.type === 'numbered_ref');
    expect(numbered).toHaveLength(2);
    expect(numbered[0]!.resolvedText).toBe('Smith, J. (2024). AI Trends.');
    expect(numbered[1]!.resolvedText).toBe('Lee, K. (2023). Industry Report.');
    expect(annotatedText).toContain('{{cite:');
  });

  it('extracts author-year citations', () => {
    const text = 'Previous work (Johnson, 2023) and (Smith & Doe, 2024a) established the baseline.';
    const { citations } = extractCitations(text, 1);
    const authorYear = citations.filter((c) => c.type === 'author_year');
    expect(authorYear).toHaveLength(2);
    expect(authorYear[0]!.rawMarker).toBe('(Johnson, 2023)');
    expect(authorYear[1]!.rawMarker).toBe('(Smith & Doe, 2024a)');
  });

  it('extracts footnote citations', () => {
    const text = 'This is important[^note1].\n\n[^note1]: See appendix B for methodology details.';
    const { citations } = extractCitations(text, 1);
    const footnotes = citations.filter((c) => c.type === 'footnote');
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]!.resolvedText).toBe('See appendix B for methodology details.');
  });

  it('returns empty for document with no citations', () => {
    const text = 'Just plain text without any citations or references.';
    const { citations, annotatedText } = extractCitations(text, 1);
    expect(citations).toHaveLength(0);
    expect(annotatedText).toBe(text);
  });

  it('handles document with many citations', () => {
    const refs = Array.from(
      { length: 20 },
      (_, i) => `[${i + 1}] Author ${i + 1}. Title ${i + 1}.`
    ).join('\n');
    const body = Array.from({ length: 20 }, (_, i) => `Point ${i + 1} [${i + 1}].`).join(' ');
    const text = `${body}\n\n${refs}`;
    const { citations } = extractCitations(text, 1);
    expect(citations.filter((c) => c.type === 'numbered_ref').length).toBe(20);
  });

  it('does not extract numbered refs when no reference list exists', () => {
    const text = 'The item [1] and [2] are just list markers, not citations.';
    const { citations } = extractCitations(text, 1);
    const numbered = citations.filter((c) => c.type === 'numbered_ref');
    expect(numbered).toHaveLength(0);
  });

  it('produces unique placeholder IDs', () => {
    const text = 'See https://a.com and https://b.com for details.';
    const { citations } = extractCitations(text, 42);
    const ids = citations.map((c) => c.placeholderId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('DOC42-REF0');
    expect(ids[1]).toBe('DOC42-REF1');
  });
});

describe('restoreCitations', () => {
  it('round-trips citation extraction', () => {
    const original = 'Evidence from https://example.com/study supports this.';
    const { citations, annotatedText } = extractCitations(original, 1);
    const restored = restoreCitations(annotatedText, citations);
    expect(restored).toBe(original);
  });
});

describe('verifyCitationPresence', () => {
  it('detects dropped citations', () => {
    const input = 'Evidence supports {{cite:DOC1-REF0}} this claim {{cite:DOC1-REF1}}.';
    const output = 'Evidence supports this claim.';
    const result = verifyCitationPresence(input, output);
    expect(result.preserved).toHaveLength(0);
    expect(result.dropped).toContain('DOC1-REF0');
    expect(result.dropped).toContain('DOC1-REF1');
  });

  it('detects all preserved citations', () => {
    const input = 'Evidence {{cite:DOC1-REF0}} and more {{cite:DOC1-REF1}}.';
    const output = 'Strong evidence {{cite:DOC1-REF0}} and additional {{cite:DOC1-REF1}}.';
    const result = verifyCitationPresence(input, output);
    expect(result.preserved).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
  });

  it('detects added citations', () => {
    const input = 'Text {{cite:DOC1-REF0}}.';
    const output = 'Text {{cite:DOC1-REF0}} and {{cite:DOC1-REF99}}.';
    const result = verifyCitationPresence(input, output);
    expect(result.preserved).toContain('DOC1-REF0');
    expect(result.added).toContain('DOC1-REF99');
  });

  it('handles no citations in either text', () => {
    const result = verifyCitationPresence('plain text', 'plain text');
    expect(result.preserved).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
    expect(result.added).toHaveLength(0);
  });
});
