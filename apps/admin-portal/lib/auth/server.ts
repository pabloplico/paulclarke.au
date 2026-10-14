import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { isDemoMode } from '@/lib/demo';
import { verifyAccessRequest } from './access';
import { hashPassword, SESSION_COOKIE_NAME, validateSession } from './index';

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: string;
};

let cachedDevUser: AuthUser | null = null;

async function getDevUser(): Promise<AuthUser> {
  if (cachedDevUser) return cachedDevUser;
  const [first] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
    })
    .from(adminUsers)
    .orderBy(adminUsers.id)
    .limit(1);
  cachedDevUser = first ?? { id: 0, email: 'dev@localhost', name: 'Dev User', role: 'admin' };
  return cachedDevUser;
}

function isAuthDisabled(): boolean {
  return process.env.AUTH_ENABLED === 'false';
}

const userColumns = {
  id: adminUsers.id,
  email: adminUsers.email,
  name: adminUsers.name,
  role: adminUsers.role,
};

/**
 * The user for a verified Cloudflare Access email, created as a `member` on
 * first visit. Safe when two first requests race: the insert does nothing if
 * the email already exists, and both then read the same row.
 *
 * The account has a random password nobody knows, so it can only be reached
 * through Access.
 */
export async function findOrCreateAccessUser(email: string): Promise<AuthUser | null> {
  const [existing] = await db
    .select(userColumns)
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(adminUsers)
    .values({
      email,
      name: email.split('@')[0] || email,
      passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
      role: 'member',
    })
    .onConflictDoNothing({ target: adminUsers.email });
  const [user] = await db
    .select(userColumns)
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  return user ?? null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isDemoMode()) {
    // The middleware has already checked the token; check it again here so
    // nothing depends on a header the middleware might have passed through
    const identity = await verifyAccessRequest(await headers());
    if (!identity) return null;
    const user = await findOrCreateAccessUser(identity.email);
    // Nobody is an admin in the demo, whatever the database row says
    return user ? { ...user, role: 'member' } : null;
  }

  if (isAuthDisabled()) return getDevUser();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await validateSession(token);
  if (!session) return null;

  const [user] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.userId))
    .limit(1);

  return user ?? null;
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * For API route handlers — returns user or throws a Response (not a redirect).
 */
export async function requireAuthApi(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return user;
}

/**
 * For server components — redirects to /workspaces if not an admin.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') redirect('/workspaces');
  return user;
}

/**
 * For API route handlers — returns 403 if not an admin.
 */
export async function requireAdminApi(): Promise<AuthUser> {
  const user = await requireAuthApi();
  if (user.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return user;
}
