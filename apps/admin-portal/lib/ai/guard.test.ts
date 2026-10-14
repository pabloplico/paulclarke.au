import { embed, generateText, streamText } from 'ai';
import { convertArrayToReadableStream, MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Outside a request there's no signed-in user; the guard asks and gets none
vi.mock('@/lib/auth/server', () => ({ getCurrentUser: async () => null }));

const {
  AiAttributionError,
  AiBudgetError,
  enterAiUser,
  guardEmbeddingModel,
  guardLanguageModel,
  withAiUser,
} = await import('./guard');
const { spendLedger } = await import('./usage-logger');

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});

function chatModel(modelId = 'gpt-4.1-nano') {
  return new MockLanguageModelV3({
    modelId,
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      // 1M in + 1M out on gpt-4.1-nano = $0.10 + $0.40
      usage: usage(1_000_000, 1_000_000),
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'ok' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: usage(1_000_000, 0),
        },
      ]),
    }),
  });
}

const saved = { ...process.env };
const g = globalThis as unknown as { _spendLedger?: unknown };

beforeEach(() => {
  g._spendLedger = undefined;
  for (const key of [
    'DEMO_MODE',
    'AI_MAX_OUTPUT_TOKENS',
    'AI_DAILY_BUDGET_USD',
    'AI_USER_DAILY_BUDGET_USD',
  ]) {
    delete process.env[key];
  }
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe('AI guard', () => {
  it('caps maxOutputTokens on every call, and keeps a lower one', async () => {
    const raw = chatModel();
    const model = guardLanguageModel(raw);
    await generateText({ model, prompt: 'a' });
    await generateText({ model, prompt: 'b', maxOutputTokens: 1_000_000 });
    await generateText({ model, prompt: 'c', maxOutputTokens: 100 });
    expect(raw.doGenerateCalls.map((call) => call.maxOutputTokens)).toEqual([4096, 4096, 100]);

    process.env.AI_MAX_OUTPUT_TOKENS = '512';
    await generateText({ model, prompt: 'd' });
    expect(raw.doGenerateCalls.at(-1)?.maxOutputTokens).toBe(512);
  });

  it('prices each call from its token usage and records it against the user', async () => {
    const model = guardLanguageModel(chatModel());
    await withAiUser(7, () => generateText({ model, prompt: 'hi' }));
    const spent = spendLedger().spentToday(7);
    expect(spent.user).toBeCloseTo(0.5);
    expect(spent.total).toBeCloseTo(0.5);
  });

  it('refuses the next call once a user reaches their daily cap', async () => {
    process.env.AI_USER_DAILY_BUDGET_USD = '0.4';
    const raw = chatModel();
    const model = guardLanguageModel(raw);
    await withAiUser(7, () => generateText({ model, prompt: 'first' }));
    await expect(withAiUser(7, () => generateText({ model, prompt: 'second' }))).rejects.toThrow(
      AiBudgetError
    );
    expect(raw.doGenerateCalls).toHaveLength(1);
    // Another user still has budget
    await withAiUser(8, () => generateText({ model, prompt: 'other user' }));
    expect(raw.doGenerateCalls).toHaveLength(2);
  });

  it('refuses everyone once the total daily cap is reached', async () => {
    process.env.AI_DAILY_BUDGET_USD = '0.6';
    const model = guardLanguageModel(chatModel());
    await withAiUser(1, () => generateText({ model, prompt: 'a' }));
    await withAiUser(2, () => generateText({ model, prompt: 'b' }));
    await expect(withAiUser(3, () => generateText({ model, prompt: 'c' }))).rejects.toThrow(
      /AI budget for today/
    );
  });

  it('has default caps in demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    const { dailyBudgets } = await import('./guard');
    expect(dailyBudgets()).toEqual({ total: 2, perUser: 0.25 });
    delete process.env.DEMO_MODE;
    expect(dailyBudgets()).toEqual({ total: undefined, perUser: undefined });
  });

  it('refuses an unattributed call in demo mode, but not elsewhere', async () => {
    const raw = chatModel();
    const model = guardLanguageModel(raw);
    await generateText({ model, prompt: 'dev' });
    process.env.DEMO_MODE = 'true';
    await expect(generateText({ model, prompt: 'demo' })).rejects.toThrow(AiAttributionError);
    expect(raw.doGenerateCalls).toHaveLength(1);
  });

  it('attributes with enterAiUser for the rest of the job, without leaking to the caller', async () => {
    process.env.DEMO_MODE = 'true';
    const model = guardLanguageModel(chatModel());
    async function job() {
      await Promise.resolve();
      enterAiUser(42);
      await generateText({ model, prompt: 'inside the job' });
    }
    await job();
    expect(spendLedger().spentToday(42).user).toBeCloseTo(0.5);
    await expect(generateText({ model, prompt: 'after the job' })).rejects.toThrow(
      AiAttributionError
    );
  });

  it('records streamed calls when the stream finishes', async () => {
    const model = guardLanguageModel(chatModel());
    await withAiUser(5, async () => {
      const result = streamText({ model, prompt: 'stream' });
      await result.consumeStream();
    });
    expect(spendLedger().spentToday(5).user).toBeCloseTo(0.1);
  });

  it('records embeddings', async () => {
    const raw = new MockEmbeddingModelV3({
      modelId: 'text-embedding-3-small',
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => [0.1]),
        usage: { tokens: 1_000_000 },
        warnings: [],
      }),
    });
    await withAiUser(9, () => embed({ model: guardEmbeddingModel(raw), value: 'text' }));
    expect(spendLedger().spentToday(9).user).toBeCloseTo(0.02);
  });
});
