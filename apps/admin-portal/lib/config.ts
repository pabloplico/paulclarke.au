// ── Centralized configuration ────────────────────────────────────────────────
// All tunable values in one place. Env vars override defaults where noted.
// For client components, import { clientConfig } from '@/lib/config'.
// For request-time code with DB overrides, use loadConfig() from '@/lib/config.server'.

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'ollama-remote';

export type AppConfig = {
  ai: {
    provider: AIProvider;
    model: string;
    fallbackProvider: AIProvider;
    fallbackModel: string;
    embedding: { model: string; batchSize: number };
    ollamaUrl: string;
    ollamaRemoteUrl: string;
  };
  rag: {
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
    routingConfidenceThreshold: number;
  };
  contextLimits: {
    metadataExtraction: number;
    routingMaterial: number;
    routingSectionPreview: number;
    gapAnalysisSectionPreview: number;
  };
  search: {
    minQueryLength: number;
    maxResults: number;
    snippetContextChars: number;
    titlePreviewChars: number;
    debounceMs: number;
  };
  dashboard: { recentChangesLimit: number };
  extraction: {
    chunkAnalysisMaxChunks: number;
    chunkAnalysisConcurrency: number;
    singleCallThreshold: number;
  };
  upload: {
    maxFileSizeBytes: number;
    maxPdfPages: number;
  };
  queue: {
    documentProcessing: {
      attempts: number;
      backoffDelay: number;
      removeOnComplete: number;
      removeOnFail: number;
      concurrency: number;
    };
    routing: {
      attempts: number;
      backoffDelay: number;
      removeOnComplete: number;
      removeOnFail: number;
      concurrency: number;
    };
  };
  marketResearch: {
    defaultCronSchedule: string;
    maxResearchSteps: number;
    minCompositeScore: number;
  };
};

/** Static defaults — safe for module-level / synchronous usage (queues, etc.). */
export const config: AppConfig = {
  ai: {
    // OpenAI by default: embeddings need an OpenAI key in every setup anyway,
    // and every OpenAI model the app offers has a price in lib/ai/pricing.ts
    provider: (process.env.AI_PROVIDER ?? 'openai') as AIProvider,
    model: process.env.AI_MODEL ?? 'gpt-4.1-mini',
    fallbackProvider: 'openai' as const,
    fallbackModel: 'gpt-4o-mini',
    embedding: {
      model: 'text-embedding-3-small',
      batchSize: 100,
    },
    ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    ollamaRemoteUrl: process.env.OLLAMA_REMOTE_URL ?? '',
  },

  rag: {
    chunkSize: 1000,
    chunkOverlap: 200,
    topK: 5,
    routingConfidenceThreshold: 0.3,
  },

  contextLimits: {
    metadataExtraction: 4000,
    routingMaterial: 6000,
    routingSectionPreview: 200,
    gapAnalysisSectionPreview: 500,
  },

  search: {
    minQueryLength: 2,
    maxResults: 20,
    snippetContextChars: 60,
    titlePreviewChars: 120,
    debounceMs: 300,
  },

  dashboard: {
    recentChangesLimit: 10,
  },

  extraction: {
    chunkAnalysisMaxChunks: 50,
    chunkAnalysisConcurrency: 3,
    singleCallThreshold: 4,
  },

  upload: {
    maxFileSizeBytes: 25 * 1024 * 1024, // 25 MB
    maxPdfPages: 200,
  },

  queue: {
    documentProcessing: {
      attempts: 3,
      backoffDelay: 5000,
      removeOnComplete: 100,
      removeOnFail: 200,
      concurrency: 2,
    },
    routing: {
      attempts: 2,
      backoffDelay: 5000,
      removeOnComplete: 100,
      removeOnFail: 200,
      concurrency: 1,
    },
  },

  marketResearch: {
    defaultCronSchedule: '0 2 * * *',
    maxResearchSteps: 15,
    minCompositeScore: 0.3,
  },
};

/** All setting keys that can be persisted to the DB. */
export const SETTING_KEYS = [
  'ai.provider',
  'ai.model',
  'ai.fallbackProvider',
  'ai.fallbackModel',
  'ai.embedding.model',
  'ai.embedding.batchSize',
  'ai.ollamaUrl',
  'ai.ollamaRemoteUrl',
  'rag.chunkSize',
  'rag.chunkOverlap',
  'rag.topK',
  'rag.routingConfidenceThreshold',
  'contextLimits.metadataExtraction',
  'contextLimits.routingMaterial',
  'contextLimits.routingSectionPreview',
  'contextLimits.gapAnalysisSectionPreview',
  'search.minQueryLength',
  'search.maxResults',
  'search.snippetContextChars',
  'search.titlePreviewChars',
  'search.debounceMs',
  'dashboard.recentChangesLimit',
  'extraction.chunkAnalysisMaxChunks',
  'extraction.chunkAnalysisConcurrency',
  'extraction.singleCallThreshold',
  'queue.documentProcessing.attempts',
  'queue.documentProcessing.backoffDelay',
  'queue.documentProcessing.removeOnComplete',
  'queue.documentProcessing.removeOnFail',
  'queue.documentProcessing.concurrency',
  'queue.routing.attempts',
  'queue.routing.backoffDelay',
  'queue.routing.removeOnComplete',
  'queue.routing.removeOnFail',
  'queue.routing.concurrency',
  'marketResearch.defaultCronSchedule',
  'marketResearch.maxResearchSteps',
  'marketResearch.minCompositeScore',
] as const;

/** Expected JS type for each setting key — used by config.server.ts for runtime validation. */
export const SETTING_TYPES: Record<(typeof SETTING_KEYS)[number], 'string' | 'number' | 'boolean'> =
  {
    'ai.provider': 'string',
    'ai.model': 'string',
    'ai.fallbackProvider': 'string',
    'ai.fallbackModel': 'string',
    'ai.embedding.model': 'string',
    'ai.embedding.batchSize': 'number',
    'ai.ollamaUrl': 'string',
    'ai.ollamaRemoteUrl': 'string',
    'rag.chunkSize': 'number',
    'rag.chunkOverlap': 'number',
    'rag.topK': 'number',
    'rag.routingConfidenceThreshold': 'number',
    'contextLimits.metadataExtraction': 'number',
    'contextLimits.routingMaterial': 'number',
    'contextLimits.routingSectionPreview': 'number',
    'contextLimits.gapAnalysisSectionPreview': 'number',
    'search.minQueryLength': 'number',
    'search.maxResults': 'number',
    'search.snippetContextChars': 'number',
    'search.titlePreviewChars': 'number',
    'search.debounceMs': 'number',
    'dashboard.recentChangesLimit': 'number',
    'extraction.chunkAnalysisMaxChunks': 'number',
    'extraction.chunkAnalysisConcurrency': 'number',
    'extraction.singleCallThreshold': 'number',
    'queue.documentProcessing.attempts': 'number',
    'queue.documentProcessing.backoffDelay': 'number',
    'queue.documentProcessing.removeOnComplete': 'number',
    'queue.documentProcessing.removeOnFail': 'number',
    'queue.documentProcessing.concurrency': 'number',
    'queue.routing.attempts': 'number',
    'queue.routing.backoffDelay': 'number',
    'queue.routing.removeOnComplete': 'number',
    'queue.routing.removeOnFail': 'number',
    'queue.routing.concurrency': 'number',
    'marketResearch.defaultCronSchedule': 'string',
    'marketResearch.maxResearchSteps': 'number',
    'marketResearch.minCompositeScore': 'number',
  };

/** Client-safe subset — no process.env access, safe for 'use client' components. */
export const clientConfig = {
  search: config.search,
  dashboard: config.dashboard,
} as const;
