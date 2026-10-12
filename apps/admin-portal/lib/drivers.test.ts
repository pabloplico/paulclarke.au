import { afterEach, describe, expect, it } from 'vitest';
import { dbDriver, queueDriver, redisEnabled } from './drivers';

const saved = { DB_DRIVER: process.env.DB_DRIVER, QUEUE_DRIVER: process.env.QUEUE_DRIVER };

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('drivers', () => {
  it('defaults to the dev setup: Postgres and BullMQ', () => {
    delete process.env.DB_DRIVER;
    delete process.env.QUEUE_DRIVER;
    expect(dbDriver()).toBe('postgres');
    expect(queueDriver()).toBe('bullmq');
    expect(redisEnabled()).toBe(true);
  });

  it('reads the demo setup: PGlite and in-memory queues, with Redis off', () => {
    process.env.DB_DRIVER = 'pglite';
    process.env.QUEUE_DRIVER = 'memory';
    expect(dbDriver()).toBe('pglite');
    expect(queueDriver()).toBe('memory');
    expect(redisEnabled()).toBe(false);
  });

  it('throws on an unknown value instead of falling back', () => {
    process.env.DB_DRIVER = 'sqlite';
    expect(() => dbDriver()).toThrow('DB_DRIVER=sqlite is not supported');
    process.env.QUEUE_DRIVER = 'Memory';
    expect(() => queueDriver()).toThrow('QUEUE_DRIVER=Memory is not supported');
  });
});
