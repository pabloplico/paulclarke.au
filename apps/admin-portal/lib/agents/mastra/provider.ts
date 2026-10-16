import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { guardEmbeddingModel, guardLanguageModel } from '@/lib/ai/guard';
import { type AIProvider, config } from '@/lib/config';

function createOllamaProvider(baseUrl: string) {
  return createOpenAI({ baseURL: `${baseUrl}/v1`, apiKey: 'ollama' });
}

/**
 * Returns the LLM based on global config settings.
 * Called by workers after loadResearchSettings() provides the override.
 */
export function getModel(override?: { provider: AIProvider; model: string }): LanguageModel {
  // Same AI guard as the rest of the app: token cap, spend caps, attribution
  return guardLanguageModel(createModel(override));
}

function createModel(override?: { provider: AIProvider; model: string }): LanguageModel {
  // Same default as the rest of the app (lib/config.ts), so it always has a price
  const provider = override?.provider ?? config.ai.provider;
  const model = override?.model ?? config.ai.model;

  if (provider === 'openai' && process.env.OPENAI_API_KEY) return openai(model);
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return anthropic(model);
  if (provider === 'gemini' && process.env.GOOGLE_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
    return google(model);
  }
  if (provider === 'ollama' && process.env.OLLAMA_URL) {
    return createOllamaProvider(process.env.OLLAMA_URL)(model);
  }
  if (provider === 'ollama-remote' && process.env.OLLAMA_REMOTE_URL) {
    return createOllamaProvider(process.env.OLLAMA_REMOTE_URL)(model);
  }

  // Fallback to OpenAI
  return openai('gpt-4o-mini');
}

/** Embedding model — always OpenAI text-embedding-3-small (same as admin-portal). */
export function getEmbeddingModel(): EmbeddingModel {
  return guardEmbeddingModel(openai.embedding('text-embedding-3-small'));
}
