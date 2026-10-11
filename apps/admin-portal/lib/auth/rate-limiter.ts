/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key (IP or email) and rejects requests
 * that exceed the configured maximum within the sliding window.
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {
    // Prune expired entries every 5 minutes.
    // unref() ensures this timer does not prevent graceful shutdown.
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  /**
   * Check whether a key is allowed to make another request.
   * Does NOT record an attempt — call `record()` separately.
   */
  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = this.attempts.get(key);

    if (!timestamps) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    // Keep only timestamps within the current window
    const recent = timestamps.filter((t) => t > windowStart);
    this.attempts.set(key, recent);

    if (recent.length >= this.maxAttempts) {
      // Earliest timestamp in the window determines when the window slides past it
      const earliest = recent[0]!;
      const retryAfterMs = earliest + this.windowMs - now;
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Record a request attempt for the given key. */
  record(key: string): void {
    const timestamps = this.attempts.get(key) ?? [];
    timestamps.push(Date.now());
    this.attempts.set(key, timestamps);
  }

  /** Clear all recorded attempts for a key (e.g. on successful login). */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /** Remove entries whose timestamps have all expired. */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.attempts) {
      const recent = timestamps.filter((t) => t > windowStart);
      if (recent.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, recent);
      }
    }
  }

  /** Expose map size for testing. */
  get size(): number {
    return this.attempts.size;
  }
}

/** Per-IP limiter: 10 requests per 15 minutes (login + signup). */
export const ipLimiter = new RateLimiter(10, 15 * 60 * 1000);

/** Per-email limiter: 5 failed attempts per 15 minutes (login only). */
export const emailLimiter = new RateLimiter(5, 15 * 60 * 1000);

/**
 * Extract the client IP from request headers.
 * Cloud Run and reverse proxies set x-forwarded-for.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be "client, proxy1, proxy2" — take the leftmost
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return 'unknown';
}
