/**
 * Which database and job queue this process uses, read from the environment.
 *
 * - DB_DRIVER=postgres (default): Postgres via DATABASE_URL.
 * - DB_DRIVER=pglite: embedded Postgres (WASM) in this process. In memory, or
 *   in PGLITE_DATA_DIR when set.
 * - QUEUE_DRIVER=bullmq (default): BullMQ on Redis via REDIS_URL.
 * - QUEUE_DRIVER=memory: in-process queues, and nothing connects to Redis.
 *
 * The defaults are the dev setup (Docker Postgres + Redis). The single-instance
 * demo sets pglite + memory. An unknown value throws instead of falling back,
 * so a typo can't silently pick the wrong backend.
 */
export type DbDriver = 'postgres' | 'pglite';
export type QueueDriver = 'bullmq' | 'memory';

function read<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${name}=${value} is not supported. Use one of: ${allowed.join(', ')}`);
}

export function dbDriver(): DbDriver {
  return read('DB_DRIVER', ['postgres', 'pglite'], 'postgres');
}

export function queueDriver(): QueueDriver {
  return read('QUEUE_DRIVER', ['bullmq', 'memory'], 'bullmq');
}

/** True when this process may use Redis (BullMQ queues, pub/sub). */
export function redisEnabled(): boolean {
  return queueDriver() === 'bullmq';
}
