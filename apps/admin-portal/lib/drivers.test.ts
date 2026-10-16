import { afterEach, describe, expect, it } from 'vitest';
import { dbDriver } from './drivers';

const saved = process.env.DB_DRIVER;

afterEach(() => {
  if (saved === undefined) delete process.env.DB_DRIVER;
  else process.env.DB_DRIVER = saved;
});

describe('drivers', () => {
  it('defaults to Postgres', () => {
    delete process.env.DB_DRIVER;
    expect(dbDriver()).toBe('postgres');
  });

  it('reads PGlite', () => {
    process.env.DB_DRIVER = 'pglite';
    expect(dbDriver()).toBe('pglite');
  });

  it('throws on an unknown value instead of falling back', () => {
    process.env.DB_DRIVER = 'sqlite';
    expect(() => dbDriver()).toThrow('DB_DRIVER=sqlite is not supported');
  });
});
