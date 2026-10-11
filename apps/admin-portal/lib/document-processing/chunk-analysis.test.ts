import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@/lib/ai/models', () => ({
  getModel: vi.fn(() => 'mock-model'),
}));

import { generateObject } from 'ai';
import type { AppConfig } from '@/lib/config';
import { analyzeAllChunks, analyzeChunk, analyzeChunksBatch } from './chunk-analysis';

const mockGenerateObject = vi.mocked(generateObject);

beforeEach(() => {
  vi.clearAllMocks();
});

const mockCfg = {
  extraction: {
    chunkAnalysisMaxChunks: 50,
    chunkAnalysisConcurrency: 2,
    singleCallThreshold: 4,
  },
} as AppConfig;

const sampleAnalysis = {
  claims: [{ text: 'Revenue grew 15% year-over-year', type: 'fact' as const, confidence: 0.9 }],
  entities: [{ name: 'Acme Corp', type: 'organization' as const }],
  topicKeywords: ['revenue', 'growth', 'financial'],
};

describe('analyzeChunk', () => {
  it('returns chunk analysis from AI', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: sampleAnalysis,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50 },
      toJsonResponse: () => new Response(),
    } as never);

    const result = await analyzeChunk('Revenue grew 15% year-over-year at Acme Corp', 0, mockCfg);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.text).toBe('Revenue grew 15% year-over-year');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('Acme Corp');
    expect(result.topicKeywords).toContain('revenue');
  });
});

describe('analyzeChunksBatch', () => {
  it('analyzes multiple chunks in a single call', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        chunks: [
          { chunkIndex: 0, analysis: sampleAnalysis },
          { chunkIndex: 1, analysis: { ...sampleAnalysis, topicKeywords: ['policy'] } },
        ],
      },
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 100 },
      toJsonResponse: () => new Response(),
    } as never);

    const chunks = [
      { content: 'Chunk 0 content', index: 0 },
      { content: 'Chunk 1 content', index: 1 },
    ];
    const result = await analyzeChunksBatch(chunks, mockCfg);

    expect(result.size).toBe(2);
    expect(result.get(0)!.topicKeywords).toContain('revenue');
    expect(result.get(1)!.topicKeywords).toContain('policy');
  });
});

describe('analyzeAllChunks', () => {
  it('uses batch call for small documents', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        chunks: [
          { chunkIndex: 0, analysis: sampleAnalysis },
          { chunkIndex: 1, analysis: sampleAnalysis },
        ],
      },
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 100 },
      toJsonResponse: () => new Response(),
    } as never);

    const chunks = [
      { content: 'Chunk 0', index: 0 },
      { content: 'Chunk 1', index: 1 },
    ];
    const result = await analyzeAllChunks(chunks, mockCfg);

    // Single call for ≤4 chunks
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(result.analyses.size).toBe(2);
    expect(result.droppedChunks).toBe(0);
  });

  it('uses parallel per-chunk calls for larger documents', async () => {
    // 5 chunks > singleCallThreshold of 4, concurrency of 2 = 3 batches
    for (let i = 0; i < 5; i++) {
      mockGenerateObject.mockResolvedValueOnce({
        object: sampleAnalysis,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50 },
        toJsonResponse: () => new Response(),
      } as never);
    }

    const chunks = Array.from({ length: 5 }, (_, i) => ({
      content: `Chunk ${i} content`,
      index: i,
    }));
    const result = await analyzeAllChunks(chunks, mockCfg);

    // 5 individual calls (concurrency 2: batch of 2, 2, 1)
    expect(mockGenerateObject).toHaveBeenCalledTimes(5);
    expect(result.analyses.size).toBe(5);
    expect(result.droppedChunks).toBe(0);
    expect(result.totalChunks).toBe(5);
  });

  it('caps chunks at maxChunks and reports dropped count', async () => {
    const cfg = {
      ...mockCfg,
      extraction: { ...mockCfg.extraction, chunkAnalysisMaxChunks: 3, singleCallThreshold: 10 },
    } as AppConfig;

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        chunks: [
          { chunkIndex: 0, analysis: sampleAnalysis },
          { chunkIndex: 1, analysis: sampleAnalysis },
          { chunkIndex: 2, analysis: sampleAnalysis },
        ],
      },
      finishReason: 'stop',
      usage: { promptTokens: 300, completionTokens: 150 },
      toJsonResponse: () => new Response(),
    } as never);

    const chunks = Array.from({ length: 10 }, (_, i) => ({
      content: `Chunk ${i}`,
      index: i,
    }));
    const result = await analyzeAllChunks(chunks, cfg);

    expect(result.analyses.size).toBe(3); // Only first 3 analyzed
    expect(result.droppedChunks).toBe(7);
    expect(result.totalChunks).toBe(10);
  });
});
