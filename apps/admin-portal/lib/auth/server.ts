import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { SESSION_COOKIE_NAME, validateSession } from './index';

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

export async function getCurrentUser(): Promise<AuthUser | null> {
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
