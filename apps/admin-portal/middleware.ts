import { jwtVerify } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';
import { AccessConfigError, verifyAccessRequest } from '@/lib/auth/access';
import { isDemoMode, isDemoRequestBlocked, isDemoRouteDisabled } from '@/lib/demo';

const SESSION_COOKIE_NAME = 'admin-session';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth/login', '/api/auth/signup'];

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The dev identity bypass must never run in production, whatever the mode
  if (process.env.DEV_ACCESS_IDENTITY && process.env.NODE_ENV === 'production') {
    console.error('FATAL: DEV_ACCESS_IDENTITY is set in production. Blocking all requests.');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // Demo mode: Cloudflare Access is the only way in, checked before anything
  // else (no public paths, no AUTH_ENABLED switch)
  if (isDemoMode()) return demoMiddleware(request);

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

async function demoMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api');

  let identity: Awaited<ReturnType<typeof verifyAccessRequest>>;
  try {
    identity = await verifyAccessRequest(request.headers);
  } catch (error) {
    if (!(error instanceof AccessConfigError)) throw error;
    console.error(`FATAL: ${error.message}. Blocking all requests.`);
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  if (!identity) {
    return isApi
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : new NextResponse('Sign in through Cloudflare Access to use this demo.', { status: 401 });
  }

  if (isDemoRouteDisabled(pathname)) {
    return isApi
      ? NextResponse.json({ error: 'Not found' }, { status: 404 })
      : new NextResponse('Not found', { status: 404 });
  }
  const blocked = isDemoRequestBlocked(pathname, request.method);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  return NextResponse.next();
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
