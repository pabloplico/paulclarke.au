import { describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from './memory';
import type { RateLimiter } from './types';

/**
 * What the RateLimiter interface promises, run against its one
 * implementation, MemoryRateLimiter. A new implementation should pass the
 * same suite.
 */
const make = (_name: string, max: number, windowMs: number): RateLimiter =>
  new MemoryRateLimiter(max, windowMs);

describe('RateLimiter contract: memory', () => {
  it('allows attempts under the limit', async () => {
    const limiter = make('under', 3, 60_000);
    await limiter.record('key');
    await limiter.record('key');
    expect(await limiter.check('key')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('blocks at the limit, with retryAfterSeconds close to the window', async () => {
    const limiter = make('at', 3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.record('key');
    const result = await limiter.check('key');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('counts keys separately', async () => {
    const limiter = make('keys', 3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.record('key-a');
    expect((await limiter.check('key-a')).allowed).toBe(false);
    expect((await limiter.check('key-b')).allowed).toBe(true);
  });

  it('allows attempts again once the window has passed', async () => {
    const limiter = make('window', 3, 150);
    for (let i = 0; i < 3; i++) await limiter.record('key');
    expect((await limiter.check('key')).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await limiter.check('key')).allowed).toBe(true);
  });

  it('forgets a key on reset', async () => {
    const limiter = make('reset', 3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.record('key');
    await limiter.reset('key');
    expect((await limiter.check('key')).allowed).toBe(true);
  });

  it('check() does not record an attempt', async () => {
    const limiter = make('check-only', 1, 60_000);
    for (let i = 0; i < 5; i++) expect((await limiter.check('key')).allowed).toBe(true);
  });
});
