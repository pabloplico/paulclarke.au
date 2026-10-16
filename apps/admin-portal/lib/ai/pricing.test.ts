import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_MODELS } from './fallback-models';
import { costUsd, MODEL_PRICES, modelPrice } from './pricing';

/** The model ids the app falls back to when nothing is configured. */
async function defaultModelIds() {
  // Without AI_PROVIDER and AI_MODEL, so the code's own defaults apply
  vi.stubEnv('AI_PROVIDER', undefined);
  vi.stubEnv('AI_MODEL', undefined);
  vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  vi.resetModules();
  const { config } = await import('@/lib/config');
  const { getModel } = await import('@/lib/agents/mastra/provider');
  const agentDefault = getModel() as { modelId: string };
  vi.stubEnv('OPENAI_API_KEY', undefined);
  const agentNoKey = getModel() as { modelId: string };
  return {
    'app default (lib/config.ts)': config.ai.model,
    'app fallback (lib/config.ts)': config.ai.fallbackModel,
    'embeddings (lib/config.ts)': config.ai.embedding.model,
    'research agents (lib/agents/mastra/provider.ts)': agentDefault.modelId,
    'research agents without a provider key': agentNoKey.modelId,
    // scripts/dev-demo.ts and .env.docker.example set this for demo mode
    demo: 'gpt-4.1-nano',
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pricing', () => {
  it('prices dated snapshots like their base model', () => {
    expect(modelPrice('gpt-4.1-nano-2025-04-14')).toEqual(modelPrice('gpt-4.1-nano'));
    expect(modelPrice('gpt-4.1-nano-extra')).toBeUndefined();
  });

  it('charges cached input at the cached rate', () => {
    // gpt-4.1-nano: $0.10 input, $0.025 cached, $0.40 output per 1M
    expect(
      costUsd('gpt-4.1-nano', { inputTokens: 1_000_000, outputTokens: 1_000_000 })
    ).toBeCloseTo(0.5);
    expect(
      costUsd('gpt-4.1-nano', {
        inputTokens: 1_000_000,
        cachedInputTokens: 1_000_000,
        outputTokens: 0,
      })
    ).toBeCloseTo(0.025);
  });

  it('returns undefined for a model it can’t price', () => {
    expect(costUsd('mystery-model', { inputTokens: 1, outputTokens: 1 })).toBeUndefined();
  });

  // An unpriced model's calls don't count towards the daily spend cap
  it('has a price for every default, demo and embedding model', async () => {
    const unpriced = Object.entries(await defaultModelIds()).filter(([, id]) => !modelPrice(id));
    expect(unpriced).toEqual([]);
  });

  it('has a price for every OpenAI model the Settings page falls back to', () => {
    const unpriced = (FALLBACK_MODELS.openai ?? []).filter((m) => !modelPrice(m.id));
    expect(unpriced).toEqual([]);
  });

  it('never charges more for cached input than for fresh input', () => {
    const wrong = Object.entries(MODEL_PRICES).filter(([, p]) => p.cachedInput > p.input);
    expect(wrong).toEqual([]);
  });
});
