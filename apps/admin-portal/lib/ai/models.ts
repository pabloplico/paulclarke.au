import type { EmbeddingModel, LanguageModel } from 'ai';
import type { AppConfig } from '@/lib/config';
import { effectiveConfig } from './config-check';
import { guardEmbeddingModel, guardLanguageModel } from './guard';
import { createEmbeddingModel, createLanguageModel } from './providers';

/**
 * The chat model for a config, wrapped in the AI guard (token cap, spend
 * caps, per-user attribution; see lib/ai/guard.ts). In demo mode the
 * provider and model always come from the environment, never from settings
 * saved in the database.
 */
export function getModel(cfg?: AppConfig): LanguageModel {
  return guardLanguageModel(createLanguageModel(effectiveConfig(cfg)));
}

/** The embedding model, wrapped in the AI guard. */
export function getEmbeddingModel(cfg?: AppConfig): EmbeddingModel {
  return guardEmbeddingModel(createEmbeddingModel(effectiveConfig(cfg)));
}
