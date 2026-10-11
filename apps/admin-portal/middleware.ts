import { jwtVerify } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'admin-session';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth/login', '/api/auth/signup'];

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Explicit toggle: AUTH_ENABLED=false disables auth entirely
  if (process.env.AUTH_ENABLED === 'false') {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = getSecret();

  // If no AUTH_SECRET configured: fail-closed in production, skip in dev
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: AUTH_SECRET is not set in production. Blocking all requests.');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    return NextResponse.next();
  }

  if (!token) {
    return redirectOrUnauthorized(request);
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return redirectOrUnauthorized(request);
  }
}

function redirectOrUnauthorized(request: NextRequest) {
  // API routes get 401 JSON
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Page routes redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
