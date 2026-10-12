import { randomUUID } from 'node:crypto';
import { getRedis } from '@/lib/redis';
import type { RateLimiter, RateLimitResult } from './types';

/**
 * Redis sliding window, shared by every instance: one sorted set per key,
 * scored by attempt time. Connects on first use, not at import.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private name: string,
    private maxAttempts: number,
    private windowMs: number
  ) {}

  private redisKey(key: string) {
    return `ratelimit:${this.name}:${key}`;
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const redisKey = this.redisKey(key);
    const results = await getRedis(`The ${this.name} rate limit`)
      .multi()
      .zremrangebyscore(redisKey, '-inf', now - this.windowMs)
      .zcard(redisKey)
      .zrange(redisKey, 0, 0, 'WITHSCORES')
      .exec();
    const count = Number(results?.[1]?.[1] ?? 0);
    const earliest = Number((results?.[2]?.[1] as string[] | undefined)?.[1]);

    if (count >= this.maxAttempts && Number.isFinite(earliest)) {
      const retryAfterMs = earliest + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async record(key: string): Promise<void> {
    const redisKey = this.redisKey(key);
    await getRedis(`The ${this.name} rate limit`)
      .multi()
      .zadd(redisKey, Date.now(), randomUUID())
      .pexpire(redisKey, this.windowMs)
      .exec();
  }

  async reset(key: string): Promise<void> {
    await getRedis(`The ${this.name} rate limit`).del(this.redisKey(key));
  }
}
