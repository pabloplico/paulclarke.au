import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { expect, it, vi } from 'vitest';

/**
 * enterAiUser() must not leak to the caller even when it's the first use of
 * the guard's AsyncLocalStorage in the process: Node 22 starts tracking
 * promises only then. Its own file, because each test file gets a fresh
 * process, so this scenario always runs first. guard.test.ts covers the
 * same behaviour, but only hit this case when shuffled to run first.
 */

vi.mock('@/lib/auth/server', () => ({ getCurrentUser: async () => null }));

const { AiAttributionError, enterAiUser, guardLanguageModel } = await import('./guard');

it('keeps enterAiUser inside the job on the first use in the process', async () => {
  process.env.DEMO_MODE = 'true';
  const model = guardLanguageModel(
    new MockLanguageModelV3({
      modelId: 'gpt-4.1-nano',
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      }),
    })
  );
  async function job() {
    await Promise.resolve();
    enterAiUser(42);
    await generateText({ model, prompt: 'inside the job' });
  }

  await job();

  // Back in the caller: no user, so demo mode refuses the call
  await expect(generateText({ model, prompt: 'after the job' })).rejects.toThrow(
    AiAttributionError
  );
  delete process.env.DEMO_MODE;
});
