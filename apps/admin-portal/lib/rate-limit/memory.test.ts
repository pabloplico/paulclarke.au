import { describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from './memory';

// Behaviour shared with the Redis limiter is in contract.test.ts
describe('MemoryRateLimiter', () => {
  it('cleanup prunes stale entries', async () => {
    const limiter = new MemoryRateLimiter(3, 50);
    await limiter.record('key-1');
    await limiter.record('key-2');
    expect(limiter.size).toBe(2);

    await new Promise((r) => setTimeout(r, 100));

    limiter.cleanup();
    expect(limiter.size).toBe(0);
  });
});
