import { encodingForModel, type TiktokenModel } from 'js-tiktoken';

/**
 * Map model strings to tiktoken encoding names.
 */
function getEncoding(model?: string) {
  if (!model) return encodingForModel('gpt-4o' as TiktokenModel);

  const m = model.toLowerCase();
  if (m.includes('gpt-4o') || m.includes('gpt-5') || m.includes('o200k')) {
    return encodingForModel('gpt-4o' as TiktokenModel);
  }
  // cl100k_base covers GPT-4, GPT-3.5, Claude (approximate), embeddings
  return encodingForModel('gpt-4' as TiktokenModel);
}

// Cache encodings by model prefix to avoid repeated initialization
const encodingCache = new Map<string, ReturnType<typeof encodingForModel>>();

function getCachedEncoding(model?: string) {
  const key = model?.toLowerCase().slice(0, 10) ?? 'default';
  let enc = encodingCache.get(key);
  if (!enc) {
    enc = getEncoding(model);
    encodingCache.set(key, enc);
  }
  return enc;
}

/**
 * Estimate token count for a text string.
 * Uses js-tiktoken (WASM) for fast, accurate estimation.
 * For Anthropic models, overestimates by ~5-10% (safe direction).
 */
export function estimateTokens(text: string, model?: string): number {
  if (!text) return 0;
  const enc = getCachedEncoding(model);
  return enc.encode(text).length;
}

/**
 * Model context window limits.
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4': 8_192,
  'gpt-5.2': 1_000_000,
  'text-embedding-3-small': 8_191,
  'text-embedding-3-large': 8_191,
};

/**
 * Get the context window for a model, with a conservative fallback.
 */
export function getModelContextWindow(model?: string): number {
  if (!model) return 128_000;
  const direct = MODEL_CONTEXT_WINDOWS[model];
  if (direct) return direct;

  // Fuzzy match
  const m = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (m.includes(key)) return value;
  }

  return 8_000; // Conservative fallback for unknown models
}

export type TokenBudget = {
  maxInputTokens: number;
  reserveOutputTokens: number;
  strategy: 'truncate' | 'reject';
};

export class TokenBudgetExceededError extends Error {
  constructor(
    public readonly estimatedTokens: number,
    public readonly limit: number,
    message?: string
  ) {
    super(
      message ??
        `Content too large for AI processing (estimated ${estimatedTokens} tokens, limit is ${limit}). Try reducing the content size.`
    );
    this.name = 'TokenBudgetExceededError';
  }
}

/**
 * Enforce a token budget on text content.
 * Returns the (possibly truncated) text and metadata about truncation.
 */
export function enforceBudget(
  text: string,
  budget: TokenBudget,
  model?: string
): { text: string; truncated: boolean; originalTokens: number; finalTokens: number } {
  const originalTokens = estimateTokens(text, model);

  if (originalTokens <= budget.maxInputTokens) {
    return { text, truncated: false, originalTokens, finalTokens: originalTokens };
  }

  if (budget.strategy === 'reject') {
    throw new TokenBudgetExceededError(originalTokens, budget.maxInputTokens);
  }

  // Truncate: use binary search on the text to find a boundary that fits
  const enc = getCachedEncoding(model);
  const tokens = enc.encode(text);
  const targetTokens = budget.maxInputTokens;

  // Decode the truncated tokens back to text
  const truncatedTokens = tokens.slice(0, targetTokens);
  let truncatedText = enc.decode(truncatedTokens);

  // Try to find a clean boundary (paragraph or sentence)
  const lastParaBreak = truncatedText.lastIndexOf('\n\n');
  if (lastParaBreak > truncatedText.length * 0.5) {
    truncatedText = truncatedText.slice(0, lastParaBreak);
  } else {
    const lastSentence = truncatedText.lastIndexOf('. ');
    if (lastSentence > truncatedText.length * 0.5) {
      truncatedText = truncatedText.slice(0, lastSentence + 1);
    }
  }

  const finalTokens = estimateTokens(truncatedText, model);
  return { text: truncatedText, truncated: true, originalTokens, finalTokens };
}
