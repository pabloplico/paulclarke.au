import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { type AppConfig, config } from '@/lib/config';

let logged = false;

/** Create an OpenAI-compatible provider pointing at an Ollama instance. */
function createOllamaProvider(baseUrl: string) {
  return createOpenAI({ baseURL: `${baseUrl}/v1`, apiKey: 'ollama' });
}

/**
 * Returns the AI language model based on config + available API keys.
 * Pass a config from loadConfig() for DB-saved overrides;
 * otherwise falls back to the static module-level config.
 */
export function getModel(cfg?: AppConfig): LanguageModel {
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

  // Fallback
  if (!logged) {
    console.log(
      `[ai] ${provider} not available, falling back to ${fallbackProvider} model: ${fallbackModel}`
    );
    logged = true;
  }
  return openai(fallbackModel);
}

/** Embedding model — always OpenAI (Anthropic has no embedding API). */
export function getEmbeddingModel(cfg?: AppConfig): EmbeddingModel {
  return openai.embedding((cfg ?? config).ai.embedding.model);
}
