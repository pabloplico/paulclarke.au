import { type AppConfig, config } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { modelPrice } from './pricing';

/**
 * The config the AI layer actually uses. In demo mode, AI provider and model
 * come from the environment only: settings saved in the database (which a
 * user could change outside the demo) can't switch the demo to another
 * provider or an unpriced model.
 */
export function effectiveConfig(cfg?: AppConfig): AppConfig {
  const base = cfg ?? config;
  return isDemoMode() ? { ...base, ai: { ...base.ai, ...config.ai } } : base;
}

const MODEL_FAMILIES: Record<string, RegExp> = {
  anthropic: /^claude-/,
  openai: /^(gpt-|o\d|chatgpt-)/,
  gemini: /^gemini-/,
};

const PROVIDER_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_API_KEY',
};

/**
 * Problems with the AI configuration, as sentences that say what to change.
 * Empty when provider, model and keys line up.
 */
export function aiConfigProblems(): string[] {
  const problems: string[] = [];
  const provider = process.env.AI_PROVIDER?.trim() || config.ai.provider;
  const model = process.env.AI_MODEL?.trim() || config.ai.model;
  const keyVar = PROVIDER_KEYS[provider];

  if (isDemoMode()) {
    if (provider !== 'openai') {
      problems.push(
        `Demo mode uses OpenAI for chat and embeddings: set AI_PROVIDER=openai (now ${provider}).`
      );
    }
    if (!process.env.AI_MODEL?.trim()) {
      problems.push('Demo mode needs AI_MODEL set explicitly (for example gpt-4.1-nano).');
    }
    if (!modelPrice(model)) {
      problems.push(
        `AI_MODEL=${model} has no price in lib/ai/pricing.ts, so the daily spend cap can't count it.`
      );
    }
    if (!modelPrice(config.ai.embedding.model)) {
      problems.push(
        `The embedding model ${config.ai.embedding.model} has no price in lib/ai/pricing.ts.`
      );
    }
  }

  const family = MODEL_FAMILIES[provider];
  if (family && !family.test(model)) {
    problems.push(
      `AI_MODEL=${model} isn't a ${provider} model. Set AI_MODEL to one (AI_PROVIDER=${provider}).`
    );
  }
  if (keyVar && !process.env[keyVar]) {
    problems.push(`AI_PROVIDER=${provider} needs ${keyVar}.`);
  }
  if (provider === 'ollama' && !config.ai.ollamaUrl)
    problems.push('AI_PROVIDER=ollama needs OLLAMA_URL.');
  if (provider === 'ollama-remote' && !config.ai.ollamaRemoteUrl) {
    problems.push('AI_PROVIDER=ollama-remote needs OLLAMA_REMOTE_URL.');
  }
  // Embeddings (search, document processing) are always OpenAI
  if (!process.env.OPENAI_API_KEY) problems.push('Embeddings use OpenAI: set OPENAI_API_KEY.');
  return problems;
}
