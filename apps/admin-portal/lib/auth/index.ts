import bcrypt from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { db } from '@/lib/db';
import { adminSessions, adminUsers } from '@/lib/db/schema';

export const SESSION_COOKIE_NAME = 'admin-session';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET env var is required');
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: number): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(getSecret());

  await db.insert(adminSessions).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

export async function validateSession(
  token: string
): Promise<{ userId: number; sessionId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = Number(payload.sub);
    if (!userId) return null;

    const [session] = await db
      .select()
      .from(adminSessions)
      .where(
        and(
          eq(adminSessions.token, token),
          eq(adminSessions.userId, userId),
          gt(adminSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) return null;
    return { userId, sessionId: session.id };
  } catch {
    return null;
  }
}

export async function destroySession(sessionId: number): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.id, sessionId));
}

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email.toLowerCase()))
    .limit(1);
  return user ?? null;
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
