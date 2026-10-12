import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetUserByEmail = vi.hoisted(() => vi.fn());
const mockHashPassword = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getUserByEmail: mockGetUserByEmail,
  hashPassword: mockHashPassword,
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
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/auth/validation', () => ({
  isValidEmail: vi.fn((email: string) => email.includes('@') && email.includes('.')),
  validatePassword: vi.fn((password: string) => {
    if (password.length < 8)
      return { valid: false, message: 'Password must be at least 8 characters.' };
    if (!/[a-zA-Z]/.test(password))
      return { valid: false, message: 'Password must contain at least one letter.' };
    if (!/[0-9]/.test(password))
      return { valid: false, message: 'Password must contain at least one digit.' };
    return { valid: true, message: '' };
  }),
}));

const mockSeedDefaultWorkspace = vi.hoisted(() => vi.fn());
vi.mock('@/lib/onboarding/seed-default-workspace', () => ({
  seedDefaultWorkspace: mockSeedDefaultWorkspace,
}));

let insertResult: unknown[] = [];
let capturedInsertValues: Record<string, unknown> | null = null;

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(() => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      capturedInsertValues = vals;
      return {
        returning: vi.fn(() => Promise.resolve(insertResult)),
      };
    }),
  })),
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

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3001/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const createdUser = { id: 1, email: 'alice@test.com', name: 'Alice', role: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  capturedInsertValues = null;
  insertResult = [createdUser];
  mockGetUserByEmail.mockResolvedValue(null);
  mockHashPassword.mockResolvedValue('$2a$12$hashedpassword');
  mockCreateSession.mockResolvedValue('mock-jwt-token');
  mockSeedDefaultWorkspace.mockResolvedValue(undefined);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.POST;
  }

  it('returns 400 when name is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ email: 'a@test.com', password: 'password1' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('required');
  });

  it('returns 400 when email is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ name: 'X', password: 'password1' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ name: 'X', email: 'a@test.com' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 for whitespace-only name', async () => {
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: '  ', email: 'a@test.com', password: 'password1' })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for whitespace-only email', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ name: 'X', email: '  ', password: 'password1' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'X', email: 'bad-email', password: 'password1' })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid email format');
  });

  it('returns 400 for password too short', async () => {
    const POST = await getHandler();
    const response = await POST(makeRequest({ name: 'X', email: 'a@test.com', password: '12345' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('8 characters');
  });

  it('returns 400 for password without digits', async () => {
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'X', email: 'a@test.com', password: 'abcdefgh' })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('digit');
  });

  it('returns 409 for duplicate email', async () => {
    mockGetUserByEmail.mockResolvedValue({ id: 99, email: 'dup@test.com' });
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'X', email: 'dup@test.com', password: 'password1' })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('already exists');
  });

  it('returns 201 with user data on successful signup', async () => {
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'Alice', email: 'alice@test.com', password: 'password1' })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.email).toBe('alice@test.com');
    expect(body.name).toBe('Alice');
    expect(body.role).toBe('admin');
  });

  it('sets session cookie on successful signup', async () => {
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'Alice', email: 'alice@test.com', password: 'password1' })
    );
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('admin-session=mock-jwt-token');
  });

  it('normalizes email to lowercase', async () => {
    const POST = await getHandler();
    await POST(makeRequest({ name: 'Alice', email: 'USER@TEST.COM', password: 'password1' }));
    expect(capturedInsertValues).toBeTruthy();
    expect(capturedInsertValues!.email).toBe('user@test.com');
  });

  it('trims name whitespace', async () => {
    const POST = await getHandler();
    await POST(makeRequest({ name: ' Alice ', email: 'alice@test.com', password: 'password1' }));
    expect(capturedInsertValues).toBeTruthy();
    expect(capturedInsertValues!.name).toBe('Alice');
  });

  it('calls seedDefaultWorkspace after user creation', async () => {
    const POST = await getHandler();
    await POST(makeRequest({ name: 'Alice', email: 'alice@test.com', password: 'password1' }));
    expect(mockSeedDefaultWorkspace).toHaveBeenCalledWith(1);
  });

  it('returns 201 even when seedDefaultWorkspace throws', async () => {
    mockSeedDefaultWorkspace.mockRejectedValue(new Error('seed failed'));
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'Alice', email: 'alice@test.com', password: 'password1' })
    );
    expect(response.status).toBe(201);
  });

  it('returns 500 when user insert fails', async () => {
    insertResult = [];
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'Alice', email: 'alice@test.com', password: 'password1' })
    );
    expect(response.status).toBe(500);
  });

  it('returns 429 when IP rate limited', async () => {
    const { ipLimiter } = await import('@/lib/auth/rate-limiter');
    vi.mocked(ipLimiter.check).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const POST = await getHandler();
    const response = await POST(
      makeRequest({ name: 'X', email: 'a@test.com', password: 'password1' })
    );
    expect(response.status).toBe(429);
  });
});
