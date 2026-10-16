import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock getSettings before importing the module under test
const mockGetSettings = vi.fn<() => Promise<Record<string, unknown>>>();
vi.mock('@/lib/settings', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...(args as [])),
}));

// Mock the static config with known defaults
vi.mock('@/lib/config', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    config: {
      ai: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        fallbackProvider: 'openai',
        fallbackModel: 'gpt-4o-mini',
        embedding: { model: 'text-embedding-3-small', batchSize: 100 },
        ollamaUrl: '',
        ollamaRemoteUrl: '',
      },
      rag: {
        chunkSize: 1000,
        chunkOverlap: 200,
        topK: 5,
        routingConfidenceThreshold: 0.3,
      },
      contextLimits: {
        metadataExtraction: 4000,
        routingMaterial: 3000,
        routingSectionPreview: 500,
        gapAnalysisSectionPreview: 1000,
      },
      search: {
        minQueryLength: 2,
        maxResults: 20,
        snippetContextChars: 100,
        titlePreviewChars: 80,
        debounceMs: 300,
      },
      dashboard: { recentChangesLimit: 10 },
      extraction: {
        chunkAnalysisMaxChunks: 50,
        chunkAnalysisConcurrency: 5,
        singleCallThreshold: 3000,
      },
      queue: {
        documentProcessing: {
          attempts: 3,
          backoffDelay: 1000,
          removeOnComplete: 100,
          removeOnFail: 200,
          concurrency: 2,
        },
        routing: {
          attempts: 2,
          backoffDelay: 1000,
          removeOnComplete: 100,
          removeOnFail: 200,
          concurrency: 1,
        },
      },
    },
  };
});

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

import { loadConfig } from './config.server';

beforeEach(() => {
  mockGetSettings.mockReset();
  warnSpy.mockClear();
});

// ── loadConfig – no DB overrides ────────────────────────────────────────────

describe('loadConfig – no DB overrides', () => {
  it('returns static defaults when DB has no settings', async () => {
    mockGetSettings.mockResolvedValue({});
    const cfg = await loadConfig();
    expect(cfg.ai.provider).toBe('anthropic');
    expect(cfg.ai.model).toBe('claude-sonnet-4-6');
    expect(cfg.rag.chunkSize).toBe(1000);
  });

  it('returns static defaults when DB throws', async () => {
    mockGetSettings.mockRejectedValue(new Error('DB unavailable'));
    const cfg = await loadConfig();
    expect(cfg.ai.provider).toBe('anthropic');
    expect(cfg.rag.topK).toBe(5);
  });
});

// ── loadConfig – DB overrides via setNested ─────────────────────────────────

describe('loadConfig – DB overrides', () => {
  it('overrides a top-level nested key (ai.model)', async () => {
    mockGetSettings.mockResolvedValue({ 'ai.model': 'gpt-4o' });
    const cfg = await loadConfig();
    expect(cfg.ai.model).toBe('gpt-4o');
    // Other ai keys should remain unchanged
    expect(cfg.ai.provider).toBe('anthropic');
  });

  it('overrides a deeply nested key (ai.embedding.batchSize)', async () => {
    mockGetSettings.mockResolvedValue({ 'ai.embedding.batchSize': 50 });
    const cfg = await loadConfig();
    expect(cfg.ai.embedding.batchSize).toBe(50);
    expect(cfg.ai.embedding.model).toBe('text-embedding-3-small');
  });

  it('overrides multiple keys at once', async () => {
    mockGetSettings.mockResolvedValue({
      'ai.provider': 'openai',
      'ai.model': 'gpt-4o',
      'rag.chunkSize': 2000,
      'dashboard.recentChangesLimit': 25,
    });
    const cfg = await loadConfig();
    expect(cfg.ai.provider).toBe('openai');
    expect(cfg.ai.model).toBe('gpt-4o');
    expect(cfg.rag.chunkSize).toBe(2000);
    expect(cfg.dashboard.recentChangesLimit).toBe(25);
  });

  it('overrides a triple-nested key (queue.documentProcessing.concurrency)', async () => {
    mockGetSettings.mockResolvedValue({
      'queue.documentProcessing.concurrency': 8,
    });
    const cfg = await loadConfig();
    expect(cfg.queue.documentProcessing.concurrency).toBe(8);
    // Sibling keys should remain unchanged
    expect(cfg.queue.documentProcessing.attempts).toBe(3);
    expect(cfg.queue.routing.concurrency).toBe(1);
  });

  it('does not mutate the static config between calls', async () => {
    mockGetSettings.mockResolvedValue({ 'rag.topK': 99 });
    const cfg1 = await loadConfig();
    expect(cfg1.rag.topK).toBe(99);

    // Second call with different override
    mockGetSettings.mockResolvedValue({ 'rag.topK': 3 });
    const cfg2 = await loadConfig();
    expect(cfg2.rag.topK).toBe(3);
    // First result should not have mutated
    expect(cfg1.rag.topK).toBe(99);
  });
});

// ── loadConfig – validation rejects unknown/mistyped keys ───────────────────

describe('loadConfig – validation', () => {
  it('skips unknown dotted key', async () => {
    mockGetSettings.mockResolvedValue({ 'newSection.newKey': 'hello' });
    const cfg = await loadConfig();
    expect((cfg as unknown as Record<string, Record<string, unknown>>).newSection).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('newSection.newKey'));
  });

  it('skips unknown single-segment key', async () => {
    mockGetSettings.mockResolvedValue({ customFlag: true });
    const cfg = await loadConfig();
    expect((cfg as unknown as Record<string, unknown>).customFlag).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('customFlag'));
  });

  it('rejects value with wrong type (string for number)', async () => {
    mockGetSettings.mockResolvedValue({ 'rag.topK': 'five' });
    const cfg = await loadConfig();
    expect(cfg.rag.topK).toBe(5); // default retained
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rag.topK'));
  });

  it('applies valid override after rejecting invalid', async () => {
    mockGetSettings.mockResolvedValue({
      'rag.topK': 'bad',
      'rag.chunkSize': 2000,
    });
    const cfg = await loadConfig();
    expect(cfg.rag.topK).toBe(5); // rejected
    expect(cfg.rag.chunkSize).toBe(2000); // accepted
  });

  it('accepts falsy but correctly-typed values (0 for number)', async () => {
    mockGetSettings.mockResolvedValue({ 'rag.topK': 0 });
    const cfg = await loadConfig();
    expect(cfg.rag.topK).toBe(0);
  });

  it('accepts empty string for string fields', async () => {
    mockGetSettings.mockResolvedValue({ 'ai.ollamaUrl': '' });
    const cfg = await loadConfig();
    expect(cfg.ai.ollamaUrl).toBe('');
  });

  it('rejects null for numeric field', async () => {
    mockGetSettings.mockResolvedValue({ 'rag.topK': null });
    const cfg = await loadConfig();
    expect(cfg.rag.topK).toBe(5); // default retained
  });
});
