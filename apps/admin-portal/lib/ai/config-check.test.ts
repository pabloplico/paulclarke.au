import { afterEach, describe, expect, it } from 'vitest';
import { aiConfigProblems } from './config-check';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function env(values: Record<string, string | undefined>) {
  for (const key of [
    'DEMO_MODE',
    'AI_PROVIDER',
    'AI_MODEL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

describe('aiConfigProblems', () => {
  it('accepts the demo setup: OpenAI, a priced model, the key', () => {
    env({
      DEMO_MODE: 'true',
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-4.1-nano',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(aiConfigProblems()).toEqual([]);
  });

  it('catches the broken dev config: Gemini provider, Claude model', () => {
    env({
      AI_PROVIDER: 'gemini',
      AI_MODEL: 'claude-sonnet-4-6',
      GOOGLE_API_KEY: 'g',
      OPENAI_API_KEY: 'o',
    });
    expect(aiConfigProblems()).toEqual([
      "AI_MODEL=claude-sonnet-4-6 isn't a gemini model. Set AI_MODEL to one (AI_PROVIDER=gemini).",
    ]);
  });

  it('catches a provider with no key', () => {
    env({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-sonnet-4-6', OPENAI_API_KEY: 'o' });
    expect(aiConfigProblems()).toEqual(['AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY.']);
  });

  it('needs the OpenAI key for embeddings whatever the chat provider', () => {
    env({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-sonnet-4-6', ANTHROPIC_API_KEY: 'a' });
    expect(aiConfigProblems()).toEqual(['Embeddings use OpenAI: set OPENAI_API_KEY.']);
  });

  it('in demo mode, insists on OpenAI, an explicit model and a known price', () => {
    env({
      DEMO_MODE: 'true',
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-9-imaginary',
      OPENAI_API_KEY: 'o',
    });
    expect(aiConfigProblems()).toEqual([
      "AI_MODEL=gpt-9-imaginary has no price in lib/ai/pricing.ts, so the daily spend cap can't count it.",
    ]);
    env({
      DEMO_MODE: 'true',
      AI_PROVIDER: 'anthropic',
      AI_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_API_KEY: 'a',
      OPENAI_API_KEY: 'o',
    });
    expect(aiConfigProblems()[0]).toMatch(/Demo mode uses OpenAI/);
    env({ DEMO_MODE: 'true', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'o' });
    expect(aiConfigProblems()).toContain(
      'Demo mode needs AI_MODEL set explicitly (for example gpt-4.1-nano).'
    );
  });
});
