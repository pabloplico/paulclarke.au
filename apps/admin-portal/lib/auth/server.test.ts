import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockValidateSession = vi.hoisted(() => vi.fn());
const mockCookieStore = vi.hoisted(() => ({
  get: vi.fn(),
}));

let dbSelectResult: unknown[] = [];

const mockDb = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(dbSelectResult)),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(dbSelectResult)),
      })),
    })),
  })),
}));

// ── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/index', () => ({
  SESSION_COOKIE_NAME: 'admin-session',
  validateSession: mockValidateSession,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminUsers: {
    id: 'id',
    email: 'email',
    name: 'name',
    role: 'role',
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ── Helpers ──────────────────────────────────────────────────────────────────

const testUser = { id: 1, email: 'test@test.com', name: 'Test User', role: 'admin' };
const memberUser = { id: 2, email: 'member@test.com', name: 'Member', role: 'member' };

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  dbSelectResult = [];
  mockCookieStore.get.mockReturnValue(undefined);
  mockValidateSession.mockResolvedValue(null);
  process.env = { ...originalEnv, AUTH_ENABLED: 'true' };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getCurrentUser', () => {
  async function getFunction() {
    const mod = await import('./server');
    return mod.getCurrentUser;
  }

  it('returns dev user from DB when AUTH_ENABLED=false', async () => {
    process.env.AUTH_ENABLED = 'false';
    dbSelectResult = [testUser];
    const getCurrentUser = await getFunction();
    const user = await getCurrentUser();
    expect(user).toEqual(testUser);
  });

  it('returns fallback dev user when AUTH_ENABLED=false and no users in DB', async () => {
    process.env.AUTH_ENABLED = 'false';
    dbSelectResult = [];
    const getCurrentUser = await getFunction();
    const user = await getCurrentUser();
    expect(user).toEqual({ id: 0, email: 'dev@localhost', name: 'Dev User', role: 'admin' });
  });

  it('returns null when no session cookie is present', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const getCurrentUser = await getFunction();
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('returns null when session token is invalid', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'bad-token' });
    mockValidateSession.mockResolvedValue(null);
    const getCurrentUser = await getFunction();
    const user = await getCurrentUser();
    expect(user).toBeNull();
    expect(mockValidateSession).toHaveBeenCalledWith('bad-token');
  });

  it('returns null when session is valid but user not in DB', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 99, sessionId: 1 });
    dbSelectResult = [];
    const getCurrentUser = await getFunction();
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('returns user when session is valid and user exists in DB', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 1, sessionId: 1 });
    dbSelectResult = [testUser];
    const getCurrentUser = await getFunction();
    const user = await getCurrentUser();
    expect(user).toEqual(testUser);
  });
});

describe('requireAuth', () => {
  async function getFunction() {
    const mod = await import('./server');
    return mod.requireAuth;
  }

  it('redirects to /login when not authenticated', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const requireAuth = await getFunction();
    await expect(requireAuth()).rejects.toThrow('REDIRECT:/login');
  });

  it('returns user when authenticated', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 1, sessionId: 1 });
    dbSelectResult = [testUser];
    const requireAuth = await getFunction();
    const user = await requireAuth();
    expect(user).toEqual(testUser);
  });
});

describe('requireAuthApi', () => {
  async function getFunction() {
    const mod = await import('./server');
    return mod.requireAuthApi;
  }

  it('throws 401 Response when not authenticated', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const requireAuthApi = await getFunction();
    try {
      await requireAuthApi();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const response = err as Response;
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    }
  });

  it('returns user when authenticated', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 1, sessionId: 1 });
    dbSelectResult = [testUser];
    const requireAuthApi = await getFunction();
    const user = await requireAuthApi();
    expect(user).toEqual(testUser);
  });
});

describe('requireAdmin', () => {
  async function getFunction() {
    const mod = await import('./server');
    return mod.requireAdmin;
  }

  it('redirects non-admin users to /workspaces', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 2, sessionId: 2 });
    dbSelectResult = [memberUser];
    const requireAdmin = await getFunction();
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/workspaces');
  });

  it('returns user when user is admin', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 1, sessionId: 1 });
    dbSelectResult = [testUser];
    const requireAdmin = await getFunction();
    const user = await requireAdmin();
    expect(user).toEqual(testUser);
  });
});

describe('requireAdminApi', () => {
  async function getFunction() {
    const mod = await import('./server');
    return mod.requireAdminApi;
  }

  it('throws 403 Response for non-admin users', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 2, sessionId: 2 });
    dbSelectResult = [memberUser];
    const requireAdminApi = await getFunction();
    try {
      await requireAdminApi();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const response = err as Response;
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      const body = await response.json();
      expect(body.error).toBe('Forbidden');
    }
  });

  it('returns user when user is admin', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue({ userId: 1, sessionId: 1 });
    dbSelectResult = [testUser];
    const requireAdminApi = await getFunction();
    const user = await requireAdminApi();
    expect(user).toEqual(testUser);
  });
});
