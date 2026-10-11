/**
 * Security regression tests for admin-portal
 * Ensures security hardening measures are not accidentally reverted.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// next.config.ts — security headers & poweredByHeader
// ---------------------------------------------------------------------------
describe('next.config.ts security', () => {
  const config = readFileSync(resolve(__dirname, '../next.config.ts'), 'utf8');

  it('disables X-Powered-By header', () => {
    expect(config).toContain('poweredByHeader: false');
  });

  it('sets X-Frame-Options: DENY', () => {
    expect(config).toContain("'X-Frame-Options'");
    expect(config).toContain("'DENY'");
  });

  it('sets X-Content-Type-Options: nosniff', () => {
    expect(config).toContain("'X-Content-Type-Options'");
    expect(config).toContain("'nosniff'");
  });

  it('sets Strict-Transport-Security', () => {
    expect(config).toContain("'Strict-Transport-Security'");
    expect(config).toContain('max-age=');
  });

  it('sets Referrer-Policy', () => {
    expect(config).toContain("'Referrer-Policy'");
  });

  it('sets Permissions-Policy', () => {
    expect(config).toContain("'Permissions-Policy'");
  });

  it('exports a headers() function', () => {
    expect(config).toMatch(/async headers\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Middleware — fail-closed auth in production
// ---------------------------------------------------------------------------
describe('middleware auth security', () => {
  const middleware = readFileSync(resolve(__dirname, '../middleware.ts'), 'utf8');

  it('supports AUTH_ENABLED toggle', () => {
    expect(middleware).toContain('AUTH_ENABLED');
    expect(middleware).toContain("=== 'false'");
  });

  it('checks NODE_ENV before skipping auth', () => {
    expect(middleware).toContain("process.env.NODE_ENV === 'production'");
  });

  it('returns 500 in production when AUTH_SECRET is missing', () => {
    // Must contain a 500 response for the production + no-secret case
    expect(middleware).toContain('status: 500');
    expect(middleware).toContain('Server misconfiguration');
  });

  it('does not unconditionally skip auth when secret is missing', () => {
    // The old vulnerable pattern was:
    //   if (!secret) { return NextResponse.next(); }
    // The new pattern must check NODE_ENV before allowing NextResponse.next()

    // Find the !secret check inside the middleware function (not getSecret)
    const middlewareFn = middleware.slice(middleware.indexOf('async function middleware'));
    const secretCheckPos = middlewareFn.indexOf('if (!secret)');
    expect(secretCheckPos).toBeGreaterThan(-1);

    // Extract 15 lines from that point
    const block = middlewareFn.slice(secretCheckPos, secretCheckPos + 400);

    // Must contain a production environment check within the !secret block
    expect(block).toContain("NODE_ENV === 'production'");
    // Must return 500 for production
    expect(block).toContain('500');
  });

  it('protects all routes except public paths', () => {
    expect(middleware).toContain('/login');
    expect(middleware).toContain('/signup');
    expect(middleware).toContain('/api/auth/login');
    expect(middleware).toContain('/api/auth/signup');
  });

  it('returns 401 for unauthorized API requests', () => {
    expect(middleware).toContain('status: 401');
  });

  it('redirects unauthorized page requests to login', () => {
    expect(middleware).toContain("'/login'");
    expect(middleware).toContain('NextResponse.redirect');
  });
});
