import {
  createLocalJWKSet,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type JWK,
  type JWTPayload,
  SignJWT,
} from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCESS_JWT_HEADER,
  AccessConfigError,
  setAccessKeySetForTests,
  verifyAccessRequest,
} from './access';

const ISSUER = 'https://paulclarke-test.cloudflareaccess.com';
const AUD = 'test-aud-tag';

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let strangerKey: CryptoKey;

const saved = { ...process.env };

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true }));
  ({ privateKey: strangerKey } = await generateKeyPair('RS256'));
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  process.env.CF_ACCESS_TEAM_DOMAIN = ISSUER;
  process.env.CF_ACCESS_AUD = AUD;
  setAccessKeySetForTests(createLocalJWKSet({ keys: [jwk] }));
});

beforeEach(() => {
  delete process.env.DEV_ACCESS_IDENTITY;
  process.env.CF_ACCESS_TEAM_DOMAIN = ISSUER;
  process.env.CF_ACCESS_AUD = AUD;
});

afterAll(() => {
  setAccessKeySetForTests(null);
  process.env = saved;
});

function token(
  claims: JWTPayload = {},
  { key = privateKey, kid = 'test-key', issuer = ISSUER, audience = AUD, expiresIn = '5m' } = {}
) {
  return new SignJWT({ email: 'Visitor@Example.com', type: 'app', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

function request(headers: Record<string, string>) {
  return verifyAccessRequest(new Headers(headers));
}

describe('verifyAccessRequest', () => {
  it('accepts a token Cloudflare would issue, and lowercases the email', async () => {
    expect(await request({ [ACCESS_JWT_HEADER]: await token() })).toEqual({
      email: 'visitor@example.com',
    });
  });

  it('rejects a request with no token', async () => {
    expect(await request({})).toBeNull();
  });

  it('never trusts the plain email header', async () => {
    expect(
      await request({
        'cf-access-authenticated-user-email': 'admin@example.com',
        'x-forwarded-email': 'admin@example.com',
      })
    ).toBeNull();
  });

  it('rejects the wrong audience (another Access application)', async () => {
    expect(
      await request({ [ACCESS_JWT_HEADER]: await token({}, { audience: 'other' }) })
    ).toBeNull();
  });

  it('rejects the wrong issuer (another Cloudflare team)', async () => {
    const other = await token({}, { issuer: 'https://someone-else.cloudflareaccess.com' });
    expect(await request({ [ACCESS_JWT_HEADER]: other })).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ email: 'visitor@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    expect(await request({ [ACCESS_JWT_HEADER]: expired })).toBeNull();
  });

  it('rejects a token signed by a key Cloudflare didn’t publish', async () => {
    expect(
      await request({ [ACCESS_JWT_HEADER]: await token({}, { key: strangerKey }) })
    ).toBeNull();
  });

  it('rejects an unsigned token (alg: none)', async () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      email: 'visitor@example.com',
      iss: ISSUER,
      aud: AUD,
      iat: now,
      exp: now + 300,
    })}.`;
    expect(await request({ [ACCESS_JWT_HEADER]: unsigned })).toBeNull();
  });

  it('rejects an HS256 token that uses the public key as its secret', async () => {
    const secret = new TextEncoder().encode(await exportSPKI(publicKey));
    const confused = await new SignJWT({ email: 'visitor@example.com' })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    expect(await request({ [ACCESS_JWT_HEADER]: confused })).toBeNull();
  });

  it('rejects a service token (no email claim)', async () => {
    const service = await token({ email: undefined, common_name: 'svc.access' });
    expect(await request({ [ACCESS_JWT_HEADER]: service })).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await request({ [ACCESS_JWT_HEADER]: 'not.a.jwt' })).toBeNull();
  });

  it('throws when the Access config is missing, rather than letting anyone in', async () => {
    delete process.env.CF_ACCESS_AUD;
    await expect(request({ [ACCESS_JWT_HEADER]: await token() })).rejects.toBeInstanceOf(
      AccessConfigError
    );
  });
});

describe('DEV_ACCESS_IDENTITY', () => {
  it('stands in for Access in development', async () => {
    process.env.DEV_ACCESS_IDENTITY = 'Dev@Localhost.test';
    expect(await request({})).toEqual({ email: 'dev@localhost.test' });
  });

  it('refuses to work in production', async () => {
    process.env.DEV_ACCESS_IDENTITY = 'dev@localhost.test';
    const env = process.env as Record<string, string | undefined>;
    const nodeEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      await expect(request({})).rejects.toThrow(
        'DEV_ACCESS_IDENTITY is set while NODE_ENV=production'
      );
    } finally {
      env.NODE_ENV = nodeEnv;
    }
  });
});
