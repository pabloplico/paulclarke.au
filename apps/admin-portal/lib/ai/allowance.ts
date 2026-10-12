import { createRateLimiter } from '@/lib/rate-limit';
import { AiBudgetError, assertWithinBudget } from './guard';

function limit(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Per user: AI_USER_REQUESTS (default 30) per AI_USER_WINDOW_MINUTES (default 10)
const aiLimiter = createRateLimiter(
  'ai-user',
  limit('AI_USER_REQUESTS', 30),
  limit('AI_USER_WINDOW_MINUTES', 10) * 60 * 1000
);

function tooMany(message: string, retryAfterSeconds?: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}),
    },
  });
}

/**
 * Every API route that starts AI work (directly, or by queueing a document
 * or routing job) calls this first. It throws a 429 Response, the same way
 * requireAuthApi throws a 401, when the user is over the request rate limit
 * or has reached a daily spend cap. lib/ai/allowance-coverage.test.ts checks
 * that no such route skips it.
 */
export async function requireAiAllowance(user: { id: number }): Promise<void> {
  const key = String(user.id);
  const rate = await aiLimiter.check(key);
  if (!rate.allowed) {
    throw tooMany('Too many AI requests. Please wait a few minutes.', rate.retryAfterSeconds);
  }
  try {
    assertWithinBudget(user.id);
  } catch (error) {
    if (error instanceof AiBudgetError) throw tooMany(error.message);
    throw error;
  }
  await aiLimiter.record(key);
}
