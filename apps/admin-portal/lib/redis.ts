import IORedis from 'ioredis';
import { redisEnabled } from '@/lib/drivers';

/**
 * The only place the app opens Redis connections. Nothing connects at import
 * time, and with QUEUE_DRIVER=memory every call throws, so a code path that
 * still needs Redis fails loudly instead of hanging (BullMQ retries forever
 * with maxRetriesPerRequest: null) or spamming ECONNREFUSED.
 */
export class RedisDisabledError extends Error {
  constructor(purpose: string) {
    super(`${purpose} needs Redis, which is off (QUEUE_DRIVER=memory)`);
    this.name = 'RedisDisabledError';
  }
}

const g = globalThis as unknown as { _redis?: IORedis; _redisDedicated?: Set<IORedis> };

function open(purpose: string): IORedis {
  if (!redisEnabled()) throw new RedisDisabledError(purpose);
  // BullMQ requires maxRetriesPerRequest: null on connections its workers use
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

/** The shared connection for BullMQ queues, workers and publishing. */
export function getRedis(purpose = 'This feature'): IORedis {
  g._redis ??= open(purpose);
  return g._redis;
}

/**
 * A connection of its own, for a Redis pub/sub subscriber (a subscribed
 * connection can't run other commands). The caller disconnects it.
 */
export function createDedicatedRedis(purpose: string): IORedis {
  const connection = open(purpose);
  g._redisDedicated ??= new Set();
  g._redisDedicated.add(connection);
  connection.once('end', () => g._redisDedicated?.delete(connection));
  return connection;
}

/** Closes every connection this module opened (tests and shutdown). */
export async function closeRedis(): Promise<void> {
  const all = [g._redis, ...(g._redisDedicated ?? [])].filter((c): c is IORedis => Boolean(c));
  g._redis = undefined;
  g._redisDedicated?.clear();
  await Promise.all(all.map((c) => c.quit().catch(() => c.disconnect())));
}
