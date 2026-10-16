/**
 * Which database this process uses, read from the environment.
 *
 * - DB_DRIVER=postgres (default): Postgres via DATABASE_URL.
 * - DB_DRIVER=pglite: embedded Postgres (WASM) in this process. In memory, or
 *   in PGLITE_DATA_DIR when set.
 *
 * Job queues and rate limits are always in-process (lib/queue,
 * lib/rate-limit): the app is single-instance by design. An unknown value
 * throws instead of falling back, so a typo can't silently pick the wrong
 * backend.
 */
export type DbDriver = 'postgres' | 'pglite';

function read<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${name}=${value} is not supported. Use one of: ${allowed.join(', ')}`);
}

export function dbDriver(): DbDriver {
  return read('DB_DRIVER', ['postgres', 'pglite'], 'postgres');
}
