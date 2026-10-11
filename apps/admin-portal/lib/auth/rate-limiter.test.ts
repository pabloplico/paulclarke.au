import { beforeEach, describe, expect, it } from 'vitest';
import { getClientIp, RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 60_000);
  });

  it('allows requests under the limit', () => {
    limiter.record('key');
    limiter.record('key');
    expect(limiter.check('key')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('blocks at the limit', () => {
    limiter.record('key');
    limiter.record('key');
    limiter.record('key');
    const result = limiter.check('key');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('treats different keys independently', () => {
    limiter.record('key-a');
    limiter.record('key-a');
    limiter.record('key-a');
    expect(limiter.check('key-a').allowed).toBe(false);
    expect(limiter.check('key-b').allowed).toBe(true);
  });

  it('allows requests after window expires', async () => {
    const shortLimiter = new RateLimiter(3, 100);
    shortLimiter.record('key');
    shortLimiter.record('key');
    shortLimiter.record('key');
    expect(shortLimiter.check('key').allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 150));

    expect(shortLimiter.check('key').allowed).toBe(true);
  });

  it('resets a key', () => {
    limiter.record('key');
    limiter.record('key');
    limiter.record('key');
    expect(limiter.check('key').allowed).toBe(false);

    limiter.reset('key');
    expect(limiter.check('key').allowed).toBe(true);
  });

  it('cleanup prunes stale entries', async () => {
    const shortLimiter = new RateLimiter(3, 50);
    shortLimiter.record('key-1');
    shortLimiter.record('key-2');
    expect(shortLimiter.size).toBe(2);

    await new Promise((r) => setTimeout(r, 100));

    shortLimiter.cleanup();
    expect(shortLimiter.size).toBe(0);
  });

  it('returns correct retryAfterSeconds', () => {
    // Record 3 attempts — window is 60s
    limiter.record('key');
    limiter.record('key');
    limiter.record('key');

    const result = limiter.check('key');
    expect(result.allowed).toBe(false);
    // Should be approximately 60 seconds
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});

describe('getClientIp', () => {
  it('extracts first IP from x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });

  it('extracts single IP from x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('10.0.0.1');
  });

  it('returns "unknown" when header is missing', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBe('unknown');
  });
});
