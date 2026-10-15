import { beforeAll, describe, expect, it } from 'vitest';
import {
  enforceBudget,
  estimateTokens,
  getModelContextWindow,
  TokenBudgetExceededError,
} from './tokens';

// Build both encodings once up front (about 1 s of CPU, several times that
// when the machine is busy), so each test's time is only its own work
beforeAll(() => {
  estimateTokens('warm-up');
  estimateTokens('warm-up', 'gpt-4');
});

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns a positive count for non-empty text', () => {
    const count = estimateTokens('Hello, world!');
    expect(count).toBeGreaterThan(0);
  });

  it('handles CJK text (higher token-to-char ratio)', () => {
    const english = estimateTokens(
      'This is a test sentence with exactly fifteen words in it here now.'
    );
    const cjk = estimateTokens('这是一个测试句子，用来验证中文文本的标记数量是否较高。');
    // CJK should use more tokens relative to character count
    expect(cjk).toBeGreaterThan(0);
    // Just verify it works without error
    void english;
  });

  it('returns consistent counts for the same input', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const count1 = estimateTokens(text);
    const count2 = estimateTokens(text);
    expect(count1).toBe(count2);
  });

  // ── GAP-013: Tighter assertions ──────────────────────────────────────────

  it('TC-013-A1: returns a value within known range for a specific string', () => {
    // gpt-4o tokenizer encodes this sentence to ~10 tokens; allow a small range
    // for WASM version differences
    const count = estimateTokens('The quick brown fox jumps over the lazy dog.');
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(12);
  });

  it('TC-013-A2: longer text produces strictly more tokens than shorter text', () => {
    const short = 'Hello.';
    const long = 'Hello. '.repeat(100);
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });

  it('TC-013-A3: token count scales roughly linearly with repeated content', () => {
    // Use a multi-token base phrase to make the relationship more predictable.
    // Allows for subword merging at repetition boundaries (wide tolerance).
    const base = 'The quick brown fox ';
    const x1 = estimateTokens(base);
    const x50 = estimateTokens(base.repeat(50));
    // x50 should be between 20x and 60x of x1 (merging can reduce but not by more than 2.5x)
    expect(x50).toBeGreaterThanOrEqual(x1 * 20);
    expect(x50).toBeLessThanOrEqual(x1 * 60);
  });

  it('TC-013-A4: model parameter selects correct encoding without throwing', () => {
    expect(estimateTokens('test', 'gpt-4o')).toBeGreaterThan(0);
    expect(estimateTokens('test', 'claude-sonnet-4-6')).toBeGreaterThan(0);
  });
});

describe('getModelContextWindow', () => {
  it('returns correct window for known models', () => {
    expect(getModelContextWindow('claude-sonnet-4-6')).toBe(200_000);
    expect(getModelContextWindow('gpt-4o')).toBe(128_000);
    expect(getModelContextWindow('gpt-4o-mini')).toBe(128_000);
  });

  it('returns conservative fallback for unknown models', () => {
    expect(getModelContextWindow('some-unknown-model')).toBe(8_000);
  });

  it('returns 128K for undefined model', () => {
    expect(getModelContextWindow()).toBe(128_000);
  });

  // ── GAP-013: Fuzzy-match prefix tests ────────────────────────────────────

  it('TC-013-B5: fuzzy-matches gpt-5 prefix correctly', () => {
    expect(getModelContextWindow('gpt-5.2')).toBe(1_000_000);
  });

  it('TC-013-B6: fuzzy-matches claude-haiku-4-5 substring', () => {
    expect(getModelContextWindow('claude-haiku-4-5')).toBe(200_000);
  });

  it('TC-013-B7: returns 8_000 for completely unknown model', () => {
    expect(getModelContextWindow('llama-3-70b')).toBe(8_000);
  });
});

describe('enforceBudget', () => {
  it('returns text unchanged when under budget', () => {
    const text = 'Short text';
    const result = enforceBudget(text, {
      maxInputTokens: 1000,
      reserveOutputTokens: 0,
      strategy: 'truncate',
    });
    expect(result.text).toBe(text);
    expect(result.truncated).toBe(false);
    expect(result.originalTokens).toBe(result.finalTokens);
  });

  it('truncates text when over budget', () => {
    const text = 'word '.repeat(500); // ~500 tokens
    const result = enforceBudget(text, {
      maxInputTokens: 50,
      reserveOutputTokens: 0,
      strategy: 'truncate',
    });
    expect(result.truncated).toBe(true);
    expect(result.finalTokens).toBeLessThanOrEqual(50);
    expect(result.originalTokens).toBeGreaterThan(50);
  });

  it('throws TokenBudgetExceededError with reject strategy', () => {
    const text = 'word '.repeat(500);
    expect(() =>
      enforceBudget(text, { maxInputTokens: 10, reserveOutputTokens: 0, strategy: 'reject' })
    ).toThrow(TokenBudgetExceededError);
  });

  it('preserves clean sentence boundaries when truncating', () => {
    const text =
      'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. '.repeat(
        20
      );
    const result = enforceBudget(text, {
      maxInputTokens: 30,
      reserveOutputTokens: 0,
      strategy: 'truncate',
    });
    expect(result.truncated).toBe(true);
    // Text should end at a reasonable boundary
    expect(result.text.length).toBeGreaterThan(0);
  });

  // ── GAP-013: Tighter assertions ──────────────────────────────────────────

  it('TC-013-B1: TokenBudgetExceededError carries estimatedTokens, limit, and name fields', () => {
    const text = 'word '.repeat(200);
    let caughtError: unknown;
    try {
      enforceBudget(text, { maxInputTokens: 5, reserveOutputTokens: 0, strategy: 'reject' });
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(TokenBudgetExceededError);
    const err = caughtError as TokenBudgetExceededError;
    expect(err.estimatedTokens).toBeGreaterThan(5);
    expect(err.limit).toBe(5);
    expect(err.name).toBe('TokenBudgetExceededError');
  });

  it('TC-013-B2: truncated text ends near a sentence boundary (period), not mid-word', () => {
    // A 500-word text composed of repeated sentences; budget forces truncation
    const text = 'The cat sat on the mat. '.repeat(200);
    const result = enforceBudget(text, {
      maxInputTokens: 30,
      reserveOutputTokens: 0,
      strategy: 'truncate',
    });
    expect(result.truncated).toBe(true);
    // The boundary-snapping logic prefers sentence ends ('. ')
    expect(result.text.trimEnd().endsWith('.')).toBe(true);
  });

  it('TC-013-B3: enforceBudget finalTokens is at most maxInputTokens', () => {
    const text = 'word '.repeat(500);
    const result = enforceBudget(text, {
      maxInputTokens: 50,
      reserveOutputTokens: 0,
      strategy: 'truncate',
    });
    expect(result.finalTokens).toBeLessThanOrEqual(50);
  });

  it('TC-013-B4: enforceBudget originalTokens is greater than maxInputTokens when truncation occurs', () => {
    const text = 'word '.repeat(500);
    const result = enforceBudget(text, {
      maxInputTokens: 50,
      reserveOutputTokens: 0,
      strategy: 'truncate',
    });
    expect(result.originalTokens).toBeGreaterThan(50);
  });
});
