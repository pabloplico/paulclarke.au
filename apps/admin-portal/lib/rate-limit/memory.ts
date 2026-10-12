import type { RateLimiter, RateLimitResult } from './types';

/**
 * In-memory sliding window: request timestamps per key, in this process
 * only. Correct for one instance; with several, each keeps its own count.
 */
export class MemoryRateLimiter implements RateLimiter {
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

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = this.attempts.get(key);

    if (!timestamps) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    // Keep only timestamps within the current window
    const recent = timestamps.filter((t) => t > windowStart);
    this.attempts.set(key, recent);

    const earliest = recent[0];
    if (recent.length >= this.maxAttempts && earliest !== undefined) {
      // Earliest timestamp in the window determines when the window slides past it
      const retryAfterMs = earliest + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  async record(key: string): Promise<void> {
    const timestamps = this.attempts.get(key) ?? [];
    timestamps.push(Date.now());
    this.attempts.set(key, timestamps);
  }

  async reset(key: string): Promise<void> {
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
