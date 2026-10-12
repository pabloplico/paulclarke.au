import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { type AppConfig, config } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';

let logged = false;

/** Create an OpenAI-compatible provider pointing at an Ollama instance. */
function createOllamaProvider(baseUrl: string) {
  return createOpenAI({ baseURL: `${baseUrl}/v1`, apiKey: 'ollama' });
}

/**
 * The raw provider model for a config: no spend or token limits. App code
 * uses getModel() in lib/ai/models.ts, which wraps this in the AI guard;
 * tests that fake the provider mock this module so the guard still runs.
 *
 * Pass a config from loadConfig() for DB-saved overrides; otherwise the
 * static module-level config is used.
 */
export function createLanguageModel(cfg?: AppConfig): LanguageModel {
  const ai = (cfg ?? config).ai;
  const { provider, model, fallbackProvider, fallbackModel } = ai;

  // Use primary provider if its API key is available
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    if (!logged) {
      console.log(`[ai] Using ${provider} model: ${model}`);
      logged = true;
    }
    return anthropic(model);
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    if (!logged) {
      console.log(`[ai] Using ${provider} model: ${model}`);
      logged = true;
    }
    return openai(model);
  }

  if (provider === 'gemini' && process.env.GOOGLE_API_KEY) {
    if (!logged) {
      console.log(`[ai] Using ${provider} model: ${model}`);
      logged = true;
    }
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
    return google(model);
  }

  if (provider === 'ollama' && ai.ollamaUrl) {
    if (!logged) {
      console.log(`[ai] Using ${provider} model: ${model} at ${ai.ollamaUrl}`);
      logged = true;
    }
    return createOllamaProvider(ai.ollamaUrl)(model);
  }

  if (provider === 'ollama-remote' && ai.ollamaRemoteUrl) {
    if (!logged) {
      console.log(`[ai] Using ${provider} model: ${model} at ${ai.ollamaRemoteUrl}`);
      logged = true;
    }
    return createOllamaProvider(ai.ollamaRemoteUrl)(model);
  }

  // Demo mode never falls back silently: the start-up check guarantees the
  // key exists, so reaching here means something changed under it
  if (isDemoMode()) {
    throw new Error(`AI provider ${provider} has no API key; demo mode does not fall back`);
  }

  // Fallback
  if (!logged) {
    console.log(
      `[ai] ${provider} not available, falling back to ${fallbackProvider} model: ${fallbackModel}`
    );
    logged = true;
  }
  return openai(fallbackModel);
}

/** Embedding model, always OpenAI (Anthropic has no embedding API). Unguarded; see getEmbeddingModel(). */
export function createEmbeddingModel(cfg?: AppConfig): EmbeddingModel {
  return openai.embedding((cfg ?? config).ai.embedding.model);
}
