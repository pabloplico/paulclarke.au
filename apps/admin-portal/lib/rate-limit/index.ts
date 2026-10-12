import { rateLimitDriver } from '@/lib/drivers';
import { MemoryRateLimiter } from './memory';
import { RedisRateLimiter } from './redis';
import type { RateLimiter } from './types';

export type { RateLimiter, RateLimitResult } from './types';

/**
 * A limiter allowing `maxAttempts` per key per `windowMs`, on the driver
 * RATE_LIMIT_DRIVER selects (memory unless set to redis).
 */
export function createRateLimiter(
  name: string,
  maxAttempts: number,
  windowMs: number
): RateLimiter {
  return rateLimitDriver() === 'redis'
    ? new RedisRateLimiter(name, maxAttempts, windowMs)
    : new MemoryRateLimiter(maxAttempts, windowMs);
}
