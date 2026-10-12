/**
 * Sliding-window rate limiter. Implementations: in-memory (per process; the
 * default, and correct for a single instance) and Redis (shared across
 * instances). lib/rate-limit/contract.test.ts runs the same tests on both.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** 0 when allowed; otherwise seconds until the oldest attempt leaves the window. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Whether `key` may make another attempt. Does not record one. */
  check(key: string): Promise<RateLimitResult>;
  /** Record an attempt for `key`. */
  record(key: string): Promise<void>;
  /** Forget every attempt for `key` (e.g. after a successful login). */
  reset(key: string): Promise<void>;
}
