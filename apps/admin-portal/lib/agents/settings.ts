import type { AIProvider } from '@/lib/config';

interface ResearchSettings {
  aiProvider: AIProvider;
  aiModel: string;
  maxResearchSteps: number;
  minCompositeScore: number;
  defaultCronSchedule: string;
}

/**
 * Load research settings from the global config system.
 * AI provider/model come from the global ai.* settings.
 * Research-specific settings come from marketResearch.* settings.
 * userId is accepted for API compatibility but settings are global (not per-user).
 */
export async function loadResearchSettings(_userId: number): Promise<ResearchSettings> {
  // Dynamic import to avoid circular deps and ensure DB overrides are loaded at request time
  const { loadConfig } = await import('@/lib/config.server');
  const cfg = await loadConfig();

  return {
    aiProvider: cfg.ai.provider,
    aiModel: cfg.ai.model,
    maxResearchSteps: cfg.marketResearch.maxResearchSteps,
    minCompositeScore: cfg.marketResearch.minCompositeScore,
    defaultCronSchedule: cfg.marketResearch.defaultCronSchedule,
  };
}
