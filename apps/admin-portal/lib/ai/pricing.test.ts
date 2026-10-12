import { describe, expect, it } from 'vitest';
import { costUsd, modelPrice } from './pricing';

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
});
