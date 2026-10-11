import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { createSession, getUserByEmail, sessionCookieOptions, verifyPassword } from '@/lib/auth';
import { emailLimiter, getClientIp, ipLimiter } from '@/lib/auth/rate-limiter';
import { isValidEmail } from '@/lib/auth/validation';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';

export async function POST(request: Request) {
  // --- Rate limit by IP ---
  const ip = getClientIp(request);
  const ipCheck = ipLimiter.check(ip);
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(ipCheck.retryAfterSeconds) },
      }
    );
  }
  ipLimiter.record(ip);

  const body = await request.json();
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // --- Validate email format ---
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  // --- Rate limit by email (failed attempts) ---
  const emailKey = `email:${email.toLowerCase()}`;
  const emailCheck = emailLimiter.check(emailKey);
  if (!emailCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many failed login attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(emailCheck.retryAfterSeconds) },
      }
    );
  }

  const user = await getUserByEmail(email);
  if (!user) {
    emailLimiter.record(emailKey);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    emailLimiter.record(emailKey);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Success — reset per-email limiter
  emailLimiter.reset(emailKey);

  // Update last login
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));

  const token = await createSession(user.id);
  const cookieOpts = sessionCookieOptions();

  const response = NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  response.cookies.set(cookieOpts.name, token, cookieOpts);

  return response;
}
