import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

let dbInsertValues: unknown = null;
let dbSelectResult: unknown[] = [];
let dbDeleteCalled = false;

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(() => ({
    values: vi.fn((vals: unknown) => {
      dbInsertValues = vals;
      return Promise.resolve();
    }),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(dbSelectResult)),
      })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => {
      dbDeleteCalled = true;
      return Promise.resolve();
    }),
  })),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gt: (col: string, val: unknown) => ({ gt: col, val }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminSessions: {
    id: 'id',
    token: 'token',
    userId: 'userId',
    expiresAt: 'expiresAt',
  },
  adminUsers: {
    id: 'id',
    email: 'email',
  },
}));

// ── Test setup ───────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-secret-key-for-jwt-signing';
const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  dbInsertValues = null;
  dbSelectResult = [];
  dbDeleteCalled = false;
  process.env = { ...originalEnv, AUTH_SECRET: TEST_SECRET };
});

afterEach(() => {
  process.env = originalEnv;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('hashPassword', () => {
  it('returns a valid bcrypt hash', async () => {
    const { hashPassword } = await import('./index');
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(hash.length).toBeGreaterThanOrEqual(50);
  });

  it('produces different hashes for the same password (unique salt)', async () => {
    const { hashPassword } = await import('./index');
    const hash1 = await hashPassword('mypassword');
    const hash2 = await hashPassword('mypassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const { verifyPassword } = await import('./index');
    const hash = await bcrypt.hash('pass123', 12);
    const result = await verifyPassword(hash, 'pass123');
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const { verifyPassword } = await import('./index');
    const hash = await bcrypt.hash('pass123', 12);
    const result = await verifyPassword(hash, 'wrong');
    expect(result).toBe(false);
  });

  it('returns false for empty password', async () => {
    const { verifyPassword } = await import('./index');
    const hash = await bcrypt.hash('pass123', 12);
    const result = await verifyPassword(hash, '');
    expect(result).toBe(false);
  });

  it('calls bcrypt.compare with (plain, hash) argument order', async () => {
    const { verifyPassword } = await import('./index');
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    const hash = await bcrypt.hash('test', 12);
    await verifyPassword(hash, 'test');
    // bcrypt.compare should be called as compare(plain, hash)
    expect(compareSpy).toHaveBeenCalledWith('test', hash);
    compareSpy.mockRestore();
  });
});

describe('createSession', () => {
  it('returns a JWT string with 3 dot-separated parts', async () => {
    const { createSession } = await import('./index');
    const token = await createSession(42);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('inserts session row in DB', async () => {
    const { createSession } = await import('./index');
    await createSession(42);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(dbInsertValues).toBeTruthy();
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const vals = dbInsertValues as any;
    expect(vals.userId).toBe(42);
    expect(vals.token).toBeDefined();
    expect(vals.expiresAt).toBeInstanceOf(Date);
  });

  it('sets JWT expiration to approximately 7 days from now', async () => {
    const { createSession } = await import('./index');
    const token = await createSession(42);
    // Decode the payload manually
    const payloadB64 = token.split('.')[1]!;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    const sevenDays = 7 * 24 * 60 * 60;
    // Allow 10 seconds tolerance
    expect(payload.exp).toBeGreaterThan(now + sevenDays - 10);
    expect(payload.exp).toBeLessThanOrEqual(now + sevenDays + 10);
  });

  it('sets sub claim to string of userId', async () => {
    const { createSession } = await import('./index');
    const token = await createSession(42);
    const payloadB64 = token.split('.')[1]!;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    expect(payload.sub).toBe('42');
  });

  it('throws when AUTH_SECRET is not set', async () => {
    delete process.env.AUTH_SECRET;
    vi.resetModules();
    const { createSession } = await import('./index');
    await expect(createSession(42)).rejects.toThrow('AUTH_SECRET env var is required');
  });
});

describe('validateSession', () => {
  async function makeValidToken(sub: string): Promise<string> {
    const secret = new TextEncoder().encode(TEST_SECRET);
    return new SignJWT({ sub })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(secret);
  }

  async function makeExpiredToken(): Promise<string> {
    const secret = new TextEncoder().encode(TEST_SECRET);
    return new SignJWT({ sub: '42' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(new Date(Date.now() - 1000))
      .setIssuedAt()
      .sign(secret);
  }

  it('returns userId and sessionId for valid token + existing DB session', async () => {
    const token = await makeValidToken('42');
    dbSelectResult = [{ id: 10, userId: 42, token, expiresAt: new Date() }];
    const { validateSession } = await import('./index');
    const result = await validateSession(token);
    expect(result).toEqual({ userId: 42, sessionId: 10 });
  });

  it('returns null for expired JWT', async () => {
    const token = await makeExpiredToken();
    const { validateSession } = await import('./index');
    const result = await validateSession(token);
    expect(result).toBeNull();
  });

  it('returns null for tampered JWT', async () => {
    const token = await makeValidToken('42');
    // Tamper with the signature
    const tampered = `${token.slice(0, -5)}XXXXX`;
    const { validateSession } = await import('./index');
    const result = await validateSession(tampered);
    expect(result).toBeNull();
  });

  it('returns null for valid JWT but no matching DB session', async () => {
    const token = await makeValidToken('42');
    dbSelectResult = [];
    const { validateSession } = await import('./index');
    const result = await validateSession(token);
    expect(result).toBeNull();
  });

  it('returns null for non-numeric sub claim', async () => {
    const token = await makeValidToken('abc');
    const { validateSession } = await import('./index');
    const result = await validateSession(token);
    expect(result).toBeNull();
  });

  it('returns null for sub claim of "0" (falsy Number)', async () => {
    const token = await makeValidToken('0');
    const { validateSession } = await import('./index');
    const result = await validateSession(token);
    expect(result).toBeNull();
  });

  it('returns null for garbage token string', async () => {
    const { validateSession } = await import('./index');
    const result = await validateSession('not-a-jwt');
    expect(result).toBeNull();
  });
});

describe('destroySession', () => {
  it('calls db.delete with the correct session id', async () => {
    const { destroySession } = await import('./index');
    await destroySession(5);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(dbDeleteCalled).toBe(true);
  });
});

describe('getUserByEmail', () => {
  it('returns user when found', async () => {
    const user = { id: 1, email: 'user@test.com', name: 'User', role: 'admin' };
    dbSelectResult = [user];
    const { getUserByEmail } = await import('./index');
    const result = await getUserByEmail('USER@Test.COM');
    expect(result).toEqual(user);
  });

  it('returns null when user not found', async () => {
    dbSelectResult = [];
    const { getUserByEmail } = await import('./index');
    const result = await getUserByEmail('nobody@test.com');
    expect(result).toBeNull();
  });
});

describe('sessionCookieOptions', () => {
  it('returns correct default options', async () => {
    const { sessionCookieOptions } = await import('./index');
    const opts = sessionCookieOptions();
    expect(opts.name).toBe('admin-session');
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it('accepts custom maxAge', async () => {
    const { sessionCookieOptions } = await import('./index');
    const opts = sessionCookieOptions(3600);
    expect(opts.maxAge).toBe(3600);
  });

  it('sets secure=true in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    vi.resetModules();
    const { sessionCookieOptions } = await import('./index');
    expect(sessionCookieOptions().secure).toBe(true);
    (process.env as Record<string, string>).NODE_ENV = 'test';
  });

  it('sets secure=false in development', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    vi.resetModules();
    const { sessionCookieOptions } = await import('./index');
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it('always sets httpOnly=true', async () => {
    const { sessionCookieOptions } = await import('./index');
    expect(sessionCookieOptions().httpOnly).toBe(true);
  });
});
