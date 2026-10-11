import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@/lib/ai/models', () => ({
  getModel: vi.fn(() => 'mock-model'),
}));

vi.mock('@/lib/config.server', () => ({
  loadConfig: vi.fn(() => ({
    contextLimits: { metadataExtraction: 4000 },
    ai: { provider: 'openai', model: 'gpt-4o-mini' },
  })),
}));

import { generateObject } from 'ai';
import type { AppConfig } from '@/lib/config';
import type { ChunkAnalysis } from './chunk-analysis';
import { extractEnrichedMetadata, extractMetadata } from './metadata';

const mockGenerateObject = vi.mocked(generateObject);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractMetadata (basic fallback)', () => {
  it('returns basic metadata from AI', async () => {
    const expected = {
      summary: 'A test document about widgets.',
      suggestedTitle: 'Widget Report',
      tags: ['widgets', 'manufacturing'],
      language: 'en',
      documentType: 'report',
    };

    mockGenerateObject.mockResolvedValueOnce({
      object: expected,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50 },
      toJsonResponse: () => new Response(),
    } as never);

    const result = await extractMetadata('Some document text about widgets...');
    expect(result.summary).toBe('A test document about widgets.');
    expect(result.documentType).toBe('report');
  });
});

describe('extractEnrichedMetadata', () => {
  const mockCfg = {
    ai: { provider: 'openai', model: 'gpt-4o-mini' },
  } as AppConfig;

  const sampleChunkAnalyses: { chunkIndex: number; analysis: ChunkAnalysis }[] = [
    {
      chunkIndex: 0,
      analysis: {
        claims: [
          { text: 'Revenue grew 15%', type: 'fact', confidence: 0.9 },
          { text: 'Expand into APAC market', type: 'decision', confidence: 0.8 },
        ],
        entities: [
          { name: 'Acme Corp', type: 'organization' },
          { name: 'Q4 2025', type: 'date' },
        ],
        topicKeywords: ['revenue', 'growth'],
      },
    },
    {
      chunkIndex: 1,
      analysis: {
        claims: [{ text: 'Hire 50 engineers by Q2', type: 'action_item', confidence: 0.85 }],
        entities: [
          { name: 'Acme Corp', type: 'organization' },
          { name: 'Engineering Division', type: 'organization' },
        ],
        topicKeywords: ['hiring', 'engineering'],
      },
    },
  ];

  it('produces enriched metadata with citations', async () => {
    const enrichedResult = {
      summary:
        'Revenue grew 15% in Q4 [chunk 0]. The company plans to expand into APAC [chunk 0] and hire 50 engineers [chunk 1].',
      suggestedTitle: 'Acme Corp Q4 2025 Report',
      tags: ['revenue', 'growth', 'hiring', 'APAC'],
      language: 'en',
      documentType: 'report',
      entities: [
        { name: 'Acme Corp', type: 'organization', chunkRefs: [0, 1] },
        { name: 'Q4 2025', type: 'date', chunkRefs: [0] },
        { name: 'Engineering Division', type: 'organization', chunkRefs: [1] },
      ],
      keyDecisions: [{ decision: 'Expand into APAC market', chunkRefs: [0], confidence: 0.8 }],
      actionItems: [{ item: 'Hire 50 engineers by Q2', chunkRefs: [1], confidence: 0.85 }],
      fieldConfidence: {
        summary: 0.9,
        title: 0.95,
        tags: 0.85,
        documentType: 0.9,
      },
    };

    mockGenerateObject.mockResolvedValueOnce({
      object: enrichedResult,
      finishReason: 'stop',
      usage: { promptTokens: 500, completionTokens: 200 },
      toJsonResponse: () => new Response(),
    } as never);

    const result = await extractEnrichedMetadata(
      sampleChunkAnalyses,
      'Revenue grew 15% at Acme Corp...',
      mockCfg
    );

    // Summary includes chunk citations
    expect(result.summary).toContain('[chunk 0]');
    expect(result.summary).toContain('[chunk 1]');

    // Entities merged across chunks
    expect(result.entities.find((e) => e.name === 'Acme Corp')!.chunkRefs).toEqual([0, 1]);

    // Decisions and action items have chunk refs
    expect(result.keyDecisions).toHaveLength(1);
    expect(result.actionItems).toHaveLength(1);

    // Confidence scores present
    expect(result.fieldConfidence.summary).toBeGreaterThan(0);
  });

  it('includes document preview in prompt', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        summary: 'Test',
        suggestedTitle: 'Test',
        tags: [],
        language: 'en',
        documentType: 'other',
        entities: [],
        keyDecisions: [],
        actionItems: [],
        fieldConfidence: { summary: 0.5, title: 0.5, tags: 0.5, documentType: 0.5 },
      },
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50 },
      toJsonResponse: () => new Response(),
    } as never);

    await extractEnrichedMetadata(sampleChunkAnalyses, 'Preview text here', mockCfg);

    const call = mockGenerateObject.mock.calls[0]![0] as { prompt: string };
    expect(call.prompt).toContain('Preview text here');
    expect(call.prompt).toContain('CHUNK 0');
    expect(call.prompt).toContain('CHUNK 1');
  });
});
