import { MemoryRateLimiter } from './memory';
import type { RateLimiter } from './types';

export type { RateLimiter, RateLimitResult } from './types';

/**
 * A limiter allowing `maxAttempts` per key per `windowMs`. Counted in this
 * process: the app is single-instance by design.
 */
export function createRateLimiter(
  name: string,
  maxAttempts: number,
  windowMs: number
): RateLimiter {
  return new MemoryRateLimiter(maxAttempts, windowMs);
}
