/**
 * Sliding-window rate limiter. Its one implementation is in-memory, counted
 * per process, which is correct for a single instance.
 * lib/rate-limit/contract.test.ts holds the behaviour it must have.
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
