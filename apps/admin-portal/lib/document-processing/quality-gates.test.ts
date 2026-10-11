import { describe, expect, it } from 'vitest';
import type { EnrichedMetadata } from './metadata';
import {
  checkChunkingQuality,
  checkCleaningQuality,
  checkExtractionQuality,
} from './quality-gates';

describe('checkCleaningQuality', () => {
  it('returns no flags when cleaning preserves most content', () => {
    const raw = 'a'.repeat(1000);
    const cleaned = 'a'.repeat(800);
    const flags = checkCleaningQuality(raw, cleaned);
    expect(flags).toEqual([]);
  });

  it('flags warning when >50% content is lost', () => {
    const raw = 'a'.repeat(1000);
    const cleaned = 'a'.repeat(400);
    const flags = checkCleaningQuality(raw, cleaned);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.code).toBe('content_loss');
    expect(flags[0]!.severity).toBe('warning');
  });

  it('flags error when >80% content is lost', () => {
    const raw = 'a'.repeat(1000);
    const cleaned = 'a'.repeat(100);
    const flags = checkCleaningQuality(raw, cleaned);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.code).toBe('content_loss');
    expect(flags[0]!.severity).toBe('error');
  });

  it('returns no flags for empty raw text', () => {
    expect(checkCleaningQuality('', '')).toEqual([]);
  });

  it('flags heading loss when headings are removed', () => {
    const raw = '# Heading 1\nContent\n## Heading 2\nMore content\n### Heading 3\nEven more';
    const cleaned = '# Heading 1\nContent\nMore content\nEven more';
    const flags = checkCleaningQuality(raw, cleaned);
    const headingFlag = flags.find((f) => f.code === 'heading_loss');
    expect(headingFlag).toBeDefined();
    expect(headingFlag!.message).toContain('2 of 3');
  });

  it('does not flag heading loss when headings are preserved', () => {
    const raw = '# Heading 1\nContent\n## Heading 2\nMore';
    const cleaned = '# Heading 1\nCleaned content\n## Heading 2\nMore cleaned';
    const flags = checkCleaningQuality(raw, cleaned);
    const headingFlag = flags.find((f) => f.code === 'heading_loss');
    expect(headingFlag).toBeUndefined();
  });
});

describe('checkChunkingQuality', () => {
  const makeChunk = (content: string, index: number) => ({
    content,
    index,
    metadata: {},
  });

  it('returns no flags for healthy chunks', () => {
    const text = 'Hello world. This is a test document with enough content.';
    const chunks = [makeChunk(text, 0)];
    const flags = checkChunkingQuality(text, chunks);
    expect(flags).toEqual([]);
  });

  it('flags empty chunks with less than 20 chars', () => {
    const text = 'Hello world. This is a test document.';
    const chunks = [makeChunk(text, 0), makeChunk('tiny', 1)];
    const flags = checkChunkingQuality(text, chunks);
    const emptyFlag = flags.find((f) => f.code === 'empty_chunks');
    expect(emptyFlag).toBeDefined();
    expect(emptyFlag!.details!.emptyChunkIndices).toEqual([1]);
  });

  it('flags excessive chunk count', () => {
    const text = 'a'.repeat(10000);
    const chunks = Array.from({ length: 201 }, (_, i) => makeChunk('chunk content here...', i));
    const flags = checkChunkingQuality(text, chunks);
    const excessiveFlag = flags.find((f) => f.code === 'excessive_chunks');
    expect(excessiveFlag).toBeDefined();
  });

  it('does not flag 200 or fewer chunks', () => {
    const text = 'a'.repeat(10000);
    const chunks = Array.from({ length: 200 }, (_, i) => makeChunk('chunk content here...', i));
    const flags = checkChunkingQuality(text, chunks);
    const excessiveFlag = flags.find((f) => f.code === 'excessive_chunks');
    expect(excessiveFlag).toBeUndefined();
  });

  it('flags low coverage when chunks miss content', () => {
    const text = 'a'.repeat(1000);
    const chunks = [makeChunk('a'.repeat(100), 0)];
    const flags = checkChunkingQuality(text, chunks);
    const coverageFlag = flags.find((f) => f.code === 'low_coverage');
    expect(coverageFlag).toBeDefined();
    expect(coverageFlag!.severity).toBe('error'); // 10% coverage
  });

  it('returns no flags for empty input', () => {
    expect(checkChunkingQuality('', [])).toEqual([]);
  });
});

describe('checkExtractionQuality', () => {
  const makeMetadata = (overrides?: Partial<EnrichedMetadata>): EnrichedMetadata => ({
    summary: 'A solid summary of the document covering key topics.',
    suggestedTitle: 'Test Document',
    tags: ['test'],
    language: 'en',
    documentType: 'report',
    entities: [],
    keyDecisions: [],
    actionItems: [],
    fieldConfidence: { summary: 0.9, title: 0.9, tags: 0.8, documentType: 0.9 },
    ...overrides,
  });

  it('returns no flags when all confidence scores are high', () => {
    const flags = checkExtractionQuality(makeMetadata());
    expect(flags).toEqual([]);
  });

  it('flags low confidence fields', () => {
    const flags = checkExtractionQuality(
      makeMetadata({
        fieldConfidence: { summary: 0.3, title: 0.9, tags: 0.4, documentType: 0.9 },
      })
    );
    const lowConfFlag = flags.find((f) => f.code === 'low_confidence');
    expect(lowConfFlag).toBeDefined();
    expect(lowConfFlag!.message).toContain('summary');
    expect(lowConfFlag!.message).toContain('tags');
  });

  it('flags missing summary', () => {
    const flags = checkExtractionQuality(makeMetadata({ summary: '' }));
    const missingFlag = flags.find((f) => f.code === 'missing_summary');
    expect(missingFlag).toBeDefined();
  });

  it('flags very short summary', () => {
    const flags = checkExtractionQuality(makeMetadata({ summary: 'Short.' }));
    const missingFlag = flags.find((f) => f.code === 'missing_summary');
    expect(missingFlag).toBeDefined();
  });

  it('does not flag adequate summary', () => {
    const flags = checkExtractionQuality(
      makeMetadata({ summary: 'This is a perfectly adequate summary of the document.' })
    );
    const missingFlag = flags.find((f) => f.code === 'missing_summary');
    expect(missingFlag).toBeUndefined();
  });
});
