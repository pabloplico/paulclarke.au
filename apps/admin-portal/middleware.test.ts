import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_JWT_HEADER, setAccessKeySetForTests } from '@/lib/auth/access';
import { middleware } from './middleware';

const ISSUER = 'https://paulclarke-test.cloudflareaccess.com';
const AUD = 'test-aud-tag';
const saved = { ...process.env };
let validToken: string;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  process.env.CF_ACCESS_TEAM_DOMAIN = ISSUER;
  process.env.CF_ACCESS_AUD = AUD;
  setAccessKeySetForTests(
    createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k', alg: 'RS256' }] })
  );
  validToken = await new SignJWT({ email: 'visitor@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k' })
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
});

beforeEach(() => {
  process.env.DEMO_MODE = 'true';
  process.env.CF_ACCESS_TEAM_DOMAIN = ISSUER;
  process.env.CF_ACCESS_AUD = AUD;
  process.env.AUTH_SECRET = 'not-used-in-demo-mode-but-set-anyway';
  delete process.env.DEV_ACCESS_IDENTITY;
  delete process.env.AUTH_ENABLED;
});

afterAll(() => {
  setAccessKeySetForTests(null);
  process.env = saved;
});

function call(
  path: string,
  { method = 'GET', token = '', headers = {} as Record<string, string> } = {}
) {
  const all = new Headers(headers);
  if (token) all.set(ACCESS_JWT_HEADER, token);
  return middleware(new NextRequest(`http://demo.test${path}`, { method, headers: all }));
}

/** NextResponse.next() marks the response with this header. */
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

describe('middleware in demo mode', () => {
  it('lets a verified visitor through to a showcase route', async () => {
    const response = await call('/api/inbox', { token: validToken });
    expect(passedThrough(response)).toBe(true);
  });

  it('returns 401 without a token, on pages and APIs alike', async () => {
    expect((await call('/api/inbox')).status).toBe(401);
    expect((await call('/workspaces')).status).toBe(401);
  });

  it('returns 401 for the plain email header alone', async () => {
    const response = await call('/api/inbox', {
      headers: { 'cf-access-authenticated-user-email': 'visitor@example.com' },
    });
    expect(response.status).toBe(401);
  });

  it('ignores the old public paths and AUTH_ENABLED=false', async () => {
    process.env.AUTH_ENABLED = 'false';
    expect((await call('/login')).status).toBe(401);
    expect((await call('/api/auth/signup', { method: 'POST' })).status).toBe(401);
  });

  it('returns 404 for switched-off features, even with a valid token', async () => {
    for (const path of [
      '/communications',
      '/api/communications',
      '/api/models',
      '/api/auth/signup',
      '/login',
    ]) {
      expect((await call(path, { token: validToken })).status, path).toBe(404);
    }
  });

  it('refuses changes to the global settings with 403', async () => {
    expect(passedThrough(await call('/api/settings', { token: validToken }))).toBe(true);
    expect((await call('/api/settings', { method: 'PATCH', token: validToken })).status).toBe(403);
  });

  it('refuses state-changing requests from other sites, including sibling subdomains', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const response = await call('/api/inbox', {
        method: 'POST',
        token: validToken,
        headers: { 'sec-fetch-site': site },
      });
      expect(response.status, site).toBe(403);
    }
  });

  it('allows the app’s own requests, and reads from anywhere', async () => {
    const own = await call('/api/inbox', {
      method: 'POST',
      token: validToken,
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(passedThrough(own)).toBe(true);
    const linkedRead = await call('/workspaces', {
      token: validToken,
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(passedThrough(linkedRead)).toBe(true);
  });

  it('fails closed (500) when the Access config is missing', async () => {
    delete process.env.CF_ACCESS_AUD;
    expect((await call('/api/inbox', { token: validToken })).status).toBe(500);
  });
});

describe('middleware outside demo mode', () => {
  it('blocks every request when DEV_ACCESS_IDENTITY is set in production', async () => {
    delete process.env.DEMO_MODE;
    process.env.DEV_ACCESS_IDENTITY = 'dev@localhost.test';
    const env = process.env as Record<string, string | undefined>;
    const nodeEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect((await call('/api/inbox')).status).toBe(500);
    } finally {
      env.NODE_ENV = nodeEnv;
    }
  });

  it('keeps the existing cookie login (no Access token needed)', async () => {
    delete process.env.DEMO_MODE;
    expect(passedThrough(await call('/login'))).toBe(true);
    expect((await call('/api/inbox')).status).toBe(401);
  });
});
