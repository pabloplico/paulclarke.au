import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@/lib/config';

// ── Mock AI SDK providers ───────────────────────────────────────────────────

const mockAnthropicModel = { provider: 'anthropic', modelId: '' };
const mockOpenaiModel = { provider: 'openai', modelId: '' };
const mockGeminiModel = { provider: 'gemini', modelId: '' };
const mockEmbeddingModel = { provider: 'openai-embedding', modelId: '' };

const mockAnthropicFn = vi.fn((model: string) => ({ ...mockAnthropicModel, modelId: model }));
const mockOpenaiFn = vi.fn((model: string) => ({ ...mockOpenaiModel, modelId: model }));
const mockGoogleFn = vi.fn((model: string) => ({ ...mockGeminiModel, modelId: model }));
const mockCreateGoogleFn = vi.fn(() => mockGoogleFn);
const mockEmbeddingFn = vi.fn((model: string) => ({ ...mockEmbeddingModel, modelId: model }));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: mockAnthropicFn,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(mockOpenaiFn, {
    embedding: mockEmbeddingFn,
  }),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mockCreateGoogleFn,
}));

vi.mock('@/lib/config', () => ({
  config: {
    ai: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      fallbackProvider: 'openai',
      fallbackModel: 'gpt-4o-mini',
      embedding: { model: 'text-embedding-3-small', batchSize: 100 },
    },
  },
}));

// Save and restore env vars
const originalEnv = { ...process.env };

function setEnvKeys(keys: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(keys)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearApiKeys() {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
}

function makeConfig(overrides: Partial<AppConfig['ai']> = {}): AppConfig {
  return {
    ai: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      fallbackProvider: 'openai' as const,
      fallbackModel: 'gpt-4o-mini',
      embedding: { model: 'text-embedding-3-small', batchSize: 100 },
      ...overrides,
    },
  } as AppConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearApiKeys();
  // Reset the `logged` flag by re-importing. We'll use resetModules for that.
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ── createLanguageModel – provider selection ───────────────────────────────────────────

describe('createLanguageModel – provider selection', () => {
  it('uses Anthropic when provider=anthropic and ANTHROPIC_API_KEY is set', async () => {
    setEnvKeys({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    const { createLanguageModel } = await import('./providers');
    const model = createLanguageModel(
      makeConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    );
    expect(mockAnthropicFn).toHaveBeenCalledWith('claude-sonnet-4-6');
    expect(model).toMatchObject({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' });
  });

  it('uses OpenAI when provider=openai and OPENAI_API_KEY is set', async () => {
    setEnvKeys({ OPENAI_API_KEY: 'sk-test' });
    const { createLanguageModel } = await import('./providers');
    const model = createLanguageModel(makeConfig({ provider: 'openai', model: 'gpt-4o' }));
    expect(mockOpenaiFn).toHaveBeenCalledWith('gpt-4o');
    expect(model).toMatchObject({ provider: 'openai', modelId: 'gpt-4o' });
  });

  it('uses Gemini when provider=gemini and GOOGLE_API_KEY is set', async () => {
    setEnvKeys({ GOOGLE_API_KEY: 'AIza-test' });
    const { createLanguageModel } = await import('./providers');
    const model = createLanguageModel(
      makeConfig({ provider: 'gemini', model: 'gemini-2.0-flash' })
    );
    expect(mockCreateGoogleFn).toHaveBeenCalledWith({ apiKey: 'AIza-test' });
    expect(mockGoogleFn).toHaveBeenCalledWith('gemini-2.0-flash');
    expect(model).toMatchObject({ provider: 'gemini', modelId: 'gemini-2.0-flash' });
  });
});

// ── createLanguageModel – fallback behavior ────────────────────────────────────────────

describe('createLanguageModel – fallback', () => {
  it('falls back to OpenAI when Anthropic key is missing', async () => {
    clearApiKeys(); // No API keys set
    const { createLanguageModel } = await import('./providers');
    const model = createLanguageModel(makeConfig({ provider: 'anthropic' }));
    expect(mockOpenaiFn).toHaveBeenCalledWith('gpt-4o-mini');
    expect(model).toMatchObject({ provider: 'openai', modelId: 'gpt-4o-mini' });
  });

  it('falls back to OpenAI when Gemini key is missing', async () => {
    clearApiKeys();
    const { createLanguageModel } = await import('./providers');
    const _model = createLanguageModel(
      makeConfig({ provider: 'gemini', model: 'gemini-2.0-flash' })
    );
    expect(mockOpenaiFn).toHaveBeenCalledWith('gpt-4o-mini');
  });

  it('uses custom fallbackModel from config', async () => {
    clearApiKeys();
    const { createLanguageModel } = await import('./providers');
    const _model = createLanguageModel(
      makeConfig({ provider: 'anthropic', fallbackModel: 'gpt-4o' })
    );
    expect(mockOpenaiFn).toHaveBeenCalledWith('gpt-4o');
  });
});

// ── createLanguageModel – uses static config when no cfg argument ──────────────────────

describe('createLanguageModel – static config fallback', () => {
  it('falls back to module-level config when no cfg passed', async () => {
    setEnvKeys({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    const { createLanguageModel } = await import('./providers');
    const _model = createLanguageModel(); // no argument
    expect(mockAnthropicFn).toHaveBeenCalledWith('claude-sonnet-4-6');
  });
});

// ── createEmbeddingModel ───────────────────────────────────────────────────────

describe('createEmbeddingModel', () => {
  it('returns OpenAI embedding model from config', async () => {
    const { createEmbeddingModel } = await import('./providers');
    const _model = createEmbeddingModel(makeConfig());
    expect(mockEmbeddingFn).toHaveBeenCalledWith('text-embedding-3-small');
  });

  it('uses custom embedding model from config', async () => {
    const { createEmbeddingModel } = await import('./providers');
    const _model = createEmbeddingModel(
      makeConfig({ embedding: { model: 'text-embedding-3-large', batchSize: 50 } })
    );
    expect(mockEmbeddingFn).toHaveBeenCalledWith('text-embedding-3-large');
  });

  it('falls back to static config when no cfg passed', async () => {
    const { createEmbeddingModel } = await import('./providers');
    createEmbeddingModel(); // no argument
    expect(mockEmbeddingFn).toHaveBeenCalledWith('text-embedding-3-small');
  });
});
