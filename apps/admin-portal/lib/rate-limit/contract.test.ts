import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeRedis } from '@/lib/redis';
import { MemoryRateLimiter } from './memory';
import { RedisRateLimiter } from './redis';
import type { RateLimiter } from './types';

/**
 * One behaviour suite for both RateLimiter implementations. The memory run
 * always happens; the Redis run needs TEST_REDIS_URL (CI provides one).
 */
const redisUrl = process.env.TEST_REDIS_URL;
const run = `${process.pid}-${Date.now()}`;

const drivers = [
  {
    driver: 'memory',
    skip: false,
    make: (_name: string, max: number, windowMs: number): RateLimiter =>
      new MemoryRateLimiter(max, windowMs),
  },
  {
    driver: 'redis',
    skip: !redisUrl,
    make: (name: string, max: number, windowMs: number): RateLimiter =>
      new RedisRateLimiter(`contract-${run}-${name}`, max, windowMs),
  },
];

describe.each(drivers)('RateLimiter contract: $driver', ({ driver, skip, make }) => {
  beforeAll(() => {
    if (driver === 'redis' && redisUrl) {
      process.env.QUEUE_DRIVER = 'bullmq';
      process.env.REDIS_URL = redisUrl;
    }
  });

  afterAll(async () => {
    if (driver === 'redis') await closeRedis();
  });

  it.skipIf(skip)('allows attempts under the limit', async () => {
    const limiter = make('under', 3, 60_000);
    await limiter.record('key');
    await limiter.record('key');
    expect(await limiter.check('key')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it.skipIf(skip)('blocks at the limit, with retryAfterSeconds close to the window', async () => {
    const limiter = make('at', 3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.record('key');
    const result = await limiter.check('key');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it.skipIf(skip)('counts keys separately', async () => {
    const limiter = make('keys', 3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.record('key-a');
    expect((await limiter.check('key-a')).allowed).toBe(false);
    expect((await limiter.check('key-b')).allowed).toBe(true);
  });

  it.skipIf(skip)('allows attempts again once the window has passed', async () => {
    const limiter = make('window', 3, 150);
    for (let i = 0; i < 3; i++) await limiter.record('key');
    expect((await limiter.check('key')).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await limiter.check('key')).allowed).toBe(true);
  });

  it.skipIf(skip)('forgets a key on reset', async () => {
    const limiter = make('reset', 3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.record('key');
    await limiter.reset('key');
    expect((await limiter.check('key')).allowed).toBe(true);
  });

  it.skipIf(skip)('check() does not record an attempt', async () => {
    const limiter = make('check-only', 1, 60_000);
    for (let i = 0; i < 5; i++) expect((await limiter.check('key')).allowed).toBe(true);
  });
});
