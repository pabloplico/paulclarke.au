import { NextResponse } from 'next/server';
import { createSession, getUserByEmail, hashPassword, sessionCookieOptions } from '@/lib/auth';
import { getClientIp, ipLimiter } from '@/lib/auth/rate-limiter';
import { isValidEmail, validatePassword } from '@/lib/auth/validation';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { seedDefaultWorkspace } from '@/lib/onboarding/seed-default-workspace';

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
  const { email, password, name } = body as { email?: string; password?: string; name?: string };

  if (!email?.trim() || !password || !name?.trim()) {
    return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
  }

  // --- Validate email format ---
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  // --- Validate password strength ---
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.message }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(adminUsers)
    .values({
      email: email.trim().toLowerCase(),
      passwordHash,
      name: name.trim(),
      role: 'admin',
    })
    .returning({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
    });

  if (!user) {
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  // Seed a default "Getting Started" workspace for the new user (best-effort)
  try {
    await seedDefaultWorkspace(user.id);
  } catch {
    // Non-fatal — user can still use the app without it
  }

  const token = await createSession(user.id);
  const cookieOpts = sessionCookieOptions();

  const response = NextResponse.json(user, { status: 201 });
  response.cookies.set(cookieOpts.name, token, cookieOpts);

  return response;
}
