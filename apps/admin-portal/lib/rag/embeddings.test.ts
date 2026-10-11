import { embed, embedMany } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '@/lib/config';
import { generateEmbedding, generateEmbeddings } from './embeddings';

vi.mock('ai', () => ({
  embed: vi.fn(() => Promise.resolve({ embedding: [0.1, 0.2, 0.3] })),
  embedMany: vi.fn(() => Promise.resolve({ embeddings: [[0.1], [0.2]] })),
}));

vi.mock('@/lib/ai/models', () => ({
  getEmbeddingModel: vi.fn(() => ({ modelId: 'mock-embedding' })),
}));

vi.mock('@/lib/config', () => ({
  config: {
    ai: {
      embedding: { batchSize: 100 },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset batchSize to default before each test
  (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 100;
});

// ---------------------------------------------------------------------------
// generateEmbedding
// ---------------------------------------------------------------------------

describe('generateEmbedding', () => {
  it('TC-101 — happy path: returns embedding array from embed call', async () => {
    vi.mocked(embed).mockResolvedValueOnce({ embedding: [0.1, 0.2, 0.3] } as never);

    const result = await generateEmbedding('Hello world');

    expect(embed).toHaveBeenCalledOnce();
    expect(embed).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'mock-embedding' },
        value: 'Hello world',
      })
    );
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('TC-102 — happy path: returns 1536-element vector (dimension check)', async () => {
    const vector = Array(1536).fill(0.01);
    vi.mocked(embed).mockResolvedValueOnce({ embedding: vector } as never);

    const result = await generateEmbedding('any text');

    expect(result).toHaveLength(1536);
  });

  it('TC-103 — error path: embed rejects → promise rejects with same error', async () => {
    vi.mocked(embed).mockRejectedValueOnce(new Error('Rate limit exceeded'));

    await expect(generateEmbedding('text')).rejects.toThrow('Rate limit exceeded');
  });

  it('TC-104 — boundary condition: empty string input is passed through without error', async () => {
    vi.mocked(embed).mockResolvedValueOnce({ embedding: [] } as never);

    const result = await generateEmbedding('');

    expect(embed).toHaveBeenCalledWith(expect.objectContaining({ value: '' }));
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateEmbeddings
// ---------------------------------------------------------------------------

describe('generateEmbeddings', () => {
  it('TC-105 — happy path: single batch when texts.length <= batchSize', async () => {
    (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 100;
    vi.mocked(embedMany).mockResolvedValueOnce({ embeddings: [[0.1], [0.2]] } as never);

    const result = await generateEmbeddings(['text one', 'text two']);

    expect(embedMany).toHaveBeenCalledOnce();
    expect(embedMany).toHaveBeenCalledWith(
      expect.objectContaining({ values: ['text one', 'text two'] })
    );
    expect(result).toEqual([[0.1], [0.2]]);
  });

  it('TC-106 — happy path: multiple batches when texts.length > batchSize', async () => {
    (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 2;
    vi.mocked(embedMany)
      .mockResolvedValueOnce({ embeddings: [[1.0], [2.0]] } as never)
      .mockResolvedValueOnce({ embeddings: [[3.0], [4.0]] } as never)
      .mockResolvedValueOnce({ embeddings: [[5.0]] } as never);

    const result = await generateEmbeddings(['a', 'b', 'c', 'd', 'e']);

    expect(embedMany).toHaveBeenCalledTimes(3);
    expect(vi.mocked(embedMany).mock.calls[0]![0].values).toEqual(['a', 'b']);
    expect(vi.mocked(embedMany).mock.calls[1]![0].values).toEqual(['c', 'd']);
    expect(vi.mocked(embedMany).mock.calls[2]![0].values).toEqual(['e']);
    expect(result).toEqual([[1.0], [2.0], [3.0], [4.0], [5.0]]);
  });

  it('TC-107 — boundary condition: empty array input returns empty array without calling embedMany', async () => {
    const result = await generateEmbeddings([]);

    expect(embedMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('TC-108 — boundary condition: exactly batchSize texts uses a single batch', async () => {
    (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 3;
    vi.mocked(embedMany).mockResolvedValueOnce({
      embeddings: [[1.0], [2.0], [3.0]],
    } as never);

    await generateEmbeddings(['x', 'y', 'z']);

    expect(embedMany).toHaveBeenCalledOnce();
    expect(vi.mocked(embedMany).mock.calls[0]![0].values).toEqual(['x', 'y', 'z']);
  });

  it('TC-109 — boundary condition: texts.length = batchSize + 1 produces exactly two batches', async () => {
    (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 3;
    vi.mocked(embedMany)
      .mockResolvedValueOnce({ embeddings: [[1.0], [2.0], [3.0]] } as never)
      .mockResolvedValueOnce({ embeddings: [[4.0]] } as never);

    await generateEmbeddings(['a', 'b', 'c', 'd']);

    expect(embedMany).toHaveBeenCalledTimes(2);
  });

  it('TC-110 — error path: embedMany rejects on first batch → whole call rejects', async () => {
    (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 100;
    vi.mocked(embedMany).mockRejectedValueOnce(new Error('Quota exceeded'));

    await expect(generateEmbeddings(['a', 'b'])).rejects.toThrow('Quota exceeded');
  });

  it('TC-111 — error path: embedMany rejects on second batch → whole call rejects', async () => {
    (config as { ai: { embedding: { batchSize: number } } }).ai.embedding.batchSize = 1;
    vi.mocked(embedMany)
      .mockResolvedValueOnce({ embeddings: [[0.1]] } as never)
      .mockRejectedValueOnce(new Error('Timeout'));

    await expect(generateEmbeddings(['a', 'b'])).rejects.toThrow('Timeout');
  });
});
