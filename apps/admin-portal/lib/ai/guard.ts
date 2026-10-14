import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  EmbeddingModel,
  EmbeddingModelMiddleware,
  LanguageModel,
  LanguageModelMiddleware,
} from 'ai';
import { APICallError, wrapEmbeddingModel, wrapLanguageModel } from 'ai';
import { isDemoMode } from '@/lib/demo';
import { costUsd, type TokenUsage } from './pricing';
import { spendLedger } from './usage-logger';

/**
 * The AI guard: every model the app uses (getModel, getEmbeddingModel and the
 * research agents' provider) is wrapped in it, so these hold for every call
 * without each call site remembering them:
 *
 * - maxOutputTokens is capped at AI_MAX_OUTPUT_TOKENS (default 4096).
 * - Before a call: the daily spend caps are checked, in total
 *   (AI_DAILY_BUDGET_USD) and for the user making it (AI_USER_DAILY_BUDGET_USD).
 * - After a call: its cost is priced from the token usage and recorded.
 * - In demo mode, a call that can't be tied to a user is refused, so spend
 *   can't escape the per-user cap through some path nobody thought of.
 * - A provider error saying the account or project budget is spent becomes
 *   AiBudgetError, so neither the AI SDK nor the job queue retries it.
 *
 * Calls are tied to a user by withAiUser() (queue workers), or else by the
 * signed-in user of the current request.
 */

export class AiBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBudgetError';
  }
}

export class AiAttributionError extends Error {
  constructor() {
    super('AI call with no user attached; demo mode refuses unattributed AI calls');
    this.name = 'AiAttributionError';
  }
}

/** Errors that won't go away on retry: queue workers discard the job. */
export function isPermanentAiError(error: unknown): boolean {
  return error instanceof AiBudgetError || error instanceof AiAttributionError;
}

/**
 * OpenAI's codes for a 429 that means the money has run out, not that
 * requests came too fast: insufficient_quota (account credit or plan limit)
 * and project_spend_limit_exceeded (the project's hard limit).
 */
const SPEND_LIMIT_CODES = new Set(['insufficient_quota', 'project_spend_limit_exceeded']);

function providerErrorCodes(error: APICallError): string[] {
  let body: unknown = error.data;
  if (!body && error.responseBody) {
    try {
      body = JSON.parse(error.responseBody);
    } catch {
      body = undefined;
    }
  }
  const detail = (body as { error?: { code?: unknown; type?: unknown } } | undefined)?.error;
  return [detail?.code, detail?.type].filter((v): v is string => typeof v === 'string');
}

export function isSpendLimitError(error: unknown): boolean {
  return (
    APICallError.isInstance(error) &&
    error.statusCode === 429 &&
    providerErrorCodes(error).some((code) => SPEND_LIMIT_CODES.has(code))
  );
}

/**
 * Runs a provider call, turning a spent-budget 429 into AiBudgetError. The
 * AI SDK retries any 429 (it can't tell the two kinds apart), and the queue
 * would retry the job on top; AiBudgetError stops both.
 */
async function providerCall<T>(call: () => PromiseLike<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isSpendLimitError(error)) {
      throw new AiBudgetError(
        'The AI provider’s spending limit has been reached, so AI features are paused for now.'
      );
    }
    throw error;
  }
}

const aiUser = new AsyncLocalStorage<{ userId: number }>();

/**
 * Counts the rest of the current async function's AI calls against `userId`.
 * For background jobs, called once they've loaded the record that says whose
 * work it is. Doesn't leak to the caller: it only affects code that runs
 * after it in the same async chain.
 */
export function enterAiUser(userId: number): void {
  aiUser.enterWith({ userId });
}

/** Runs `fn` with its AI calls counted against `userId`. */
export function withAiUser<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  return aiUser.run({ userId }, fn);
}

function numberEnv(name: string, fallback: number | undefined): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

export function maxOutputTokens(): number {
  return numberEnv('AI_MAX_OUTPUT_TOKENS', 4096) ?? 4096;
}

/** Daily caps in US dollars. Demo mode has defaults; elsewhere they're off unless set. */
export function dailyBudgets(): { total?: number; perUser?: number } {
  const demo = isDemoMode();
  return {
    total: numberEnv('AI_DAILY_BUDGET_USD', demo ? 2 : undefined),
    perUser: numberEnv('AI_USER_DAILY_BUDGET_USD', demo ? 0.25 : undefined),
  };
}

/** Throws AiBudgetError when today's spend has reached a cap. */
export function assertWithinBudget(userId: number | undefined): void {
  const { total, perUser } = dailyBudgets();
  const spent = spendLedger().spentToday(userId);
  if (total !== undefined && spent.total >= total) {
    throw new AiBudgetError(
      'The demo has used its AI budget for today. It resets at midnight, Brisbane time.'
    );
  }
  if (perUser !== undefined && userId !== undefined && spent.user >= perUser) {
    throw new AiBudgetError(
      'You have used your AI budget for today. It resets at midnight, Brisbane time.'
    );
  }
}

async function currentUserId(): Promise<number | undefined> {
  const store = aiUser.getStore();
  if (store) return store.userId;
  try {
    // The signed-in user of the current request; throws outside one
    const { getCurrentUser } = await import('@/lib/auth/server');
    return (await getCurrentUser())?.id;
  } catch {
    return undefined;
  }
}

async function beforeCall(): Promise<number | undefined> {
  const userId = await currentUserId();
  if (userId === undefined && isDemoMode()) throw new AiAttributionError();
  assertWithinBudget(userId);
  return userId;
}

const unpriced = new Set<string>();

function afterCall(userId: number | undefined, modelId: string, kind: string, usage: TokenUsage) {
  const usd = costUsd(modelId, usage);
  if (usd === undefined) {
    if (!unpriced.has(modelId)) {
      unpriced.add(modelId);
      console.warn(
        `[ai-spend] No price for ${modelId}; its calls don't count towards the daily cap`
      );
    }
  } else {
    spendLedger().record(userId, usd);
  }
  console.log(
    '[ai-spend]',
    JSON.stringify({
      kind,
      model: modelId,
      userId,
      ...usage,
      usd,
      timestamp: new Date().toISOString(),
    })
  );
}

const languageMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const cap = maxOutputTokens();
    return { ...params, maxOutputTokens: Math.min(params.maxOutputTokens ?? cap, cap) };
  },
  wrapGenerate: async ({ doGenerate, model }) => {
    const userId = await beforeCall();
    const result = await providerCall(doGenerate);
    afterCall(userId, model.modelId, 'generate', {
      inputTokens: result.usage.inputTokens.total ?? 0,
      cachedInputTokens: result.usage.inputTokens.cacheRead ?? 0,
      outputTokens: result.usage.outputTokens.total ?? 0,
    });
    return result;
  },
  wrapStream: async ({ doStream, model }) => {
    const userId = await beforeCall();
    const { stream, ...rest } = await providerCall(doStream);
    const counted = stream.pipeThrough(
      new TransformStream({
        transform(part, controller) {
          if (part.type === 'finish') {
            afterCall(userId, model.modelId, 'stream', {
              inputTokens: part.usage.inputTokens.total ?? 0,
              cachedInputTokens: part.usage.inputTokens.cacheRead ?? 0,
              outputTokens: part.usage.outputTokens.total ?? 0,
            });
          }
          controller.enqueue(part);
        },
      })
    );
    return { stream: counted, ...rest };
  },
};

const embeddingMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: 'v3',
  wrapEmbed: async ({ doEmbed, model, params }) => {
    const userId = await beforeCall();
    const result = await providerCall(doEmbed);
    // Providers report embedding tokens; estimate (4 characters a token) if not
    const tokens =
      result.usage?.tokens ??
      Math.ceil(params.values.reduce((n, v) => n + String(v).length, 0) / 4);
    afterCall(userId, model.modelId, 'embed', { inputTokens: tokens, outputTokens: 0 });
    return result;
  },
};

export function guardLanguageModel(model: LanguageModel): LanguageModel {
  if (typeof model === 'string') throw new Error('Pass a model instance, not a gateway id');
  return wrapLanguageModel({ model: model as never, middleware: languageMiddleware });
}

export function guardEmbeddingModel(model: EmbeddingModel): EmbeddingModel {
  if (typeof model === 'string') throw new Error('Pass a model instance, not a gateway id');
  return wrapEmbeddingModel({ model: model as never, middleware: embeddingMiddleware });
}
