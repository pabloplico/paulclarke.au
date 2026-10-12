/**
 * Prices in US dollars per 1M tokens, for the daily spend cap.
 *
 * From OpenAI's pricing page (developers.openai.com/api/docs/pricing),
 * standard tier, checked 2026-10-12. Update when the demo's model changes:
 * demo mode refuses to start with a model that has no price here, because
 * the spend cap can't count what it can't price.
 */
type Price = { input: number; cachedInput: number; output: number };

export const MODEL_PRICES: Record<string, Price> = {
  'gpt-4.1-nano': { input: 0.1, cachedInput: 0.025, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.0 },
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  // Embeddings have input tokens only
  'text-embedding-3-small': { input: 0.02, cachedInput: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, cachedInput: 0.13, output: 0 },
};

/** The price for a model id, including dated snapshots such as gpt-4.1-nano-2025-04-14. */
export function modelPrice(modelId: string): Price | undefined {
  if (MODEL_PRICES[modelId]) return MODEL_PRICES[modelId];
  const base = Object.keys(MODEL_PRICES).find(
    (id) => /^-\d{4}-\d{2}-\d{2}$/.test(modelId.slice(id.length)) && modelId.startsWith(id)
  );
  return base ? MODEL_PRICES[base] : undefined;
}

export type TokenUsage = { inputTokens: number; cachedInputTokens?: number; outputTokens: number };

/** Cost in US dollars, or undefined for a model with no known price. */
export function costUsd(modelId: string, usage: TokenUsage): number | undefined {
  const price = modelPrice(modelId);
  if (!price) return undefined;
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  return (
    ((usage.inputTokens - cached) * price.input +
      cached * price.cachedInput +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
