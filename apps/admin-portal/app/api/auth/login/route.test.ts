import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetUserByEmail = vi.hoisted(() => vi.fn());
const mockVerifyPassword = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getUserByEmail: mockGetUserByEmail,
  verifyPassword: mockVerifyPassword,
  createSession: mockCreateSession,
  sessionCookieOptions: () => ({
    name: 'admin-session',
    httpOnly: true,
    secure: false,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 604800,
  }),
}));

vi.mock('@/lib/auth/rate-limiter', () => ({
  ipLimiter: {
    check: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
    record: vi.fn(async () => {}),
  },
  emailLimiter: {
    check: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
    record: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
  },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/auth/validation', () => ({
  isValidEmail: vi.fn((email: string) => email.includes('@') && email.includes('.')),
}));

const mockDbUpdate = vi.hoisted(() => ({
  set: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminUsers: { id: 'id', email: 'email', name: 'name', role: 'role', lastLoginAt: 'lastLoginAt' },
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => mockDbUpdate),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const testUser = {
  id: 1,
  email: 'test@test.com',
  name: 'Test User',
  role: 'admin',
  passwordHash: '$2a$12$fakehash',
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetUserByEmail.mockResolvedValue(null);
  mockVerifyPassword.mockResolvedValue(false);
  mockCreateSession.mockResolvedValue('mock-jwt-token');
  // Reset rate limiters to allowed state (clearAllMocks does not reset mockReturnValue)
  const { ipLimiter, emailLimiter } = await import('@/lib/auth/rate-limiter');
  vi.mocked(ipLimiter.check).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  vi.mocked(emailLimiter.check).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when email is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ password: 'password1' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Email and password are required');
  });

  it('returns 400 when password is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'test@test.com' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Email and password are required');
  });

  it('returns 400 for empty body', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'not-an-email', password: 'password1' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid email format');
  });

  it('returns 401 when user is not found', async () => {
    mockGetUserByEmail.mockResolvedValue(null);
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'no@test.com', password: 'password1' }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Invalid email or password');
  });

  it('returns 401 when password is wrong', async () => {
    mockGetUserByEmail.mockResolvedValue(testUser);
    mockVerifyPassword.mockResolvedValue(false);
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'test@test.com', password: 'wrongpass1' }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Invalid email or password');
  });

  it('returns 200 with user data on successful login', async () => {
    mockGetUserByEmail.mockResolvedValue(testUser);
    mockVerifyPassword.mockResolvedValue(true);
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'test@test.com', password: 'correct1' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.email).toBe('test@test.com');
    expect(body.name).toBe('Test User');
    expect(body.role).toBe('admin');
  });

  it('sets session cookie on successful login', async () => {
    mockGetUserByEmail.mockResolvedValue(testUser);
    mockVerifyPassword.mockResolvedValue(true);
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'test@test.com', password: 'correct1' }));
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('admin-session=mock-jwt-token');
  });

  it('returns 429 when IP rate limited', async () => {
    const { ipLimiter } = await import('@/lib/auth/rate-limiter');
    vi.mocked(ipLimiter.check).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'test@test.com', password: 'password1' }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain('Too many requests');
  });

  it('returns 429 when email rate limited', async () => {
    const { emailLimiter } = await import('@/lib/auth/rate-limiter');
    vi.mocked(emailLimiter.check).mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'test@test.com', password: 'password1' }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain('Too many failed login attempts');
  });
});
