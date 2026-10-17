// @vitest-environment node
import { ACCESS_JWT_HEADER } from '@repo/access-auth';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTPayload,
  SignJWT,
} from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setAccessKeySetForTests } from './identity';
import app from './index';
import {
  apiAs,
  apiWithHeaders,
  createTestPlatform,
  STARTUP_MS,
  type TestPlatform,
} from './test/platform';

describe('with the migrations applied', () => {
  let platform: TestPlatform;
  beforeAll(async () => {
    platform = await createTestPlatform();
  }, STARTUP_MS);
  afterAll(() => platform?.dispose());

  it('reports the server and database up, without sign-in', async () => {
    const response = await app.request('/api/health', {}, platform.env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('before the migrations', () => {
  let platform: TestPlatform;
  beforeAll(async () => {
    platform = await createTestPlatform({ migrate: false });
  }, STARTUP_MS);
  afterAll(() => platform?.dispose());

  it('reports the database down with a 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.request('/api/health', {}, platform.env);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});

describe('sign-in', () => {
  let production: TestPlatform;
  let development: TestPlatform;
  beforeAll(async () => {
    [production, development] = await Promise.all([
      createTestPlatform({
        vars: { ENVIRONMENT: 'production', DEV_ACCESS_IDENTITY: 'dev@example.com' },
      }),
      createTestPlatform({
        vars: { ENVIRONMENT: 'development', DEV_ACCESS_IDENTITY: 'Dev@Example.com ' },
      }),
    ]);
  }, STARTUP_MS);
  afterAll(async () => {
    await Promise.all([production?.dispose(), development?.dispose()]);
  });

  it('refuses every API request in production, whatever the dev identity says', async () => {
    for (const call of [apiAs(production.env), apiAs(production.env, 'someone@example.com')]) {
      for (const path of ['/api/me', '/api/jobs', '/api/skills', '/api/taxonomy']) {
        const response = await call('GET', path);
        expect(response.status, path).toBe(401);
        expect(await response.json()).toEqual({ error: 'Sign in to use JobQuest.' });
      }
    }
  });

  it('uses DEV_ACCESS_IDENTITY in development, lower-cased and trimmed', async () => {
    const response = await apiAs(development.env)('GET', '/api/me');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'dev@example.com' });
  });

  it('lets the development identity cookie pick the visitor', async () => {
    const response = await apiAs(development.env, 'Other@Example.com')('GET', '/api/me');

    expect(await response.json()).toEqual({ email: 'other@example.com' });
  });

  it('refuses an identity that is not an email', async () => {
    const response = await apiAs(development.env, 'not-an-email')('GET', '/api/me');

    expect(response.status).toBe(401);
  });

  it('answers unknown API paths with a JSON 404 once signed in', async () => {
    const response = await apiAs(development.env)('GET', '/api/nothing-here');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});

describe('Cloudflare Access (production)', () => {
  const ISSUER = 'https://jobquest-test.cloudflareaccess.com';
  const AUD = 'jobquest-test-aud';
  let platform: TestPlatform;
  let privateKey: CryptoKey;
  let strangerKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    ({ privateKey: strangerKey } = await generateKeyPair('RS256'));
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
    // Local keys: no test fetches the real team's
    setAccessKeySetForTests(createLocalJWKSet({ keys: [jwk] }));
    platform = await createTestPlatform({
      vars: {
        ENVIRONMENT: 'production',
        CF_ACCESS_TEAM_DOMAIN: 'jobquest-test.cloudflareaccess.com',
        CF_ACCESS_AUD: AUD,
        DEV_ACCESS_IDENTITY: 'dev@example.com',
      },
    });
  }, STARTUP_MS);
  afterAll(async () => {
    setAccessKeySetForTests(null);
    await platform?.dispose();
  });

  function token(
    claims: JWTPayload = {},
    { key = privateKey, audience = AUD, issuer = ISSUER, expiresIn = '5m' } = {}
  ) {
    return new SignJWT({ email: 'Visitor@Example.com', type: 'app', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);
  }
  const asToken = async (jwt: string) => apiWithHeaders(platform.env, { [ACCESS_JWT_HEADER]: jwt });

  it('lets in a visitor with a valid Access token, by their lower-cased email', async () => {
    const response = await (await asToken(await token()))('GET', '/api/me');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'visitor@example.com' });
  });

  it('refuses a request without a token, or with only a plain email header', async () => {
    expect((await apiWithHeaders(platform.env, {})('GET', '/api/me')).status).toBe(401);
    const forged = apiWithHeaders(platform.env, {
      'cf-access-authenticated-user-email': 'visitor@example.com',
    });
    expect((await forged('GET', '/api/me')).status).toBe(401);
  });

  it('ignores the development identity cookie and variable', async () => {
    const response = await apiAs(platform.env, 'visitor@example.com')('GET', '/api/me');

    expect(response.status).toBe(401);
  });

  it('refuses a token for another Access application on the same team', async () => {
    const response = await (await asToken(await token({}, { audience: 'admin-demo-aud' })))(
      'GET',
      '/api/me'
    );

    expect(response.status).toBe(401);
  });

  it('refuses an expired token, a token from another key, and a service token', async () => {
    const expired = await token({}, { expiresIn: '-1m' });
    const stranger = await token({}, { key: strangerKey });
    const service = await token({ email: undefined, common_name: 'ci.access' });

    for (const jwt of [expired, stranger, service]) {
      expect((await (await asToken(jwt))('GET', '/api/me')).status).toBe(401);
    }
  });

  it('keeps each Access visitor to their own jobs', async () => {
    const owner = await asToken(await token({ email: 'owner@example.com' }));
    const other = await asToken(await token({ email: 'other@example.com' }));
    const created = await owner('POST', '/api/jobs', {
      title: 'Vue Developer',
      company: 'Example Co',
    });
    const job = (await created.json()) as { id: string };

    expect((await other('GET', `/api/jobs/${job.id}`)).status).toBe(404);
    const list = (await (await other('GET', '/api/jobs')).json()) as { id: string }[];
    expect(list.map((row) => row.id)).not.toContain(job.id);
  });

  it('refuses every request, and says why in the log, when the Access config is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unconfigured = { ...platform.env, CF_ACCESS_AUD: undefined };

    const response = await apiWithHeaders(unconfigured, {
      [ACCESS_JWT_HEADER]: await token(),
    })('GET', '/api/me');

    expect(response.status).toBe(401);
    expect(error.mock.calls.flat().join(' ')).toContain('Cloudflare Access is not configured');
  });
});
