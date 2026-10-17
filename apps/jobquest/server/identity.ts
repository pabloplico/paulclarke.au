import { accessIssuer, accessKeySet, verifyAccessJwt } from '@repo/access-auth';
import type { JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { Env } from './env';

/**
 * Development only: picks the identity per browser, so each E2E test (and anyone
 * trying two visitors locally) gets a profile of its own.
 */
export const DEV_IDENTITY_COOKIE = 'jq-dev-identity';
const DEFAULT_DEV_IDENTITY = 'dev@localhost.test';

const emailSchema = z.email();

/** What a request says about who is asking. */
export interface IdentityClaims {
  /** The jq-dev-identity cookie (used only in development). */
  devCookie?: string;
  /** The Cf-Access-Jwt-Assertion header Cloudflare Access adds. */
  accessJwt?: string | null;
}

// The team's signing keys, per Worker isolate: jose caches them and refetches on rotation
let keySet: { issuer: string; keys: JWTVerifyGetKey } | undefined;
let testKeys: JWTVerifyGetKey | null = null;

/** Tests only: verify against local keys instead of fetching the team's. */
export function setAccessKeySetForTests(keys: JWTVerifyGetKey | null) {
  testKeys = keys;
}

function keysFor(issuer: string): JWTVerifyGetKey {
  if (testKeys) return testKeys;
  if (keySet?.issuer !== issuer) keySet = { issuer, keys: accessKeySet(issuer) };
  return keySet.keys;
}

/**
 * The visitor's email, lower-cased, or null when nobody is signed in.
 *
 * In development the identity comes from the cookie above, then
 * DEV_ACCESS_IDENTITY, then dev@localhost.test. Everywhere else the only way in
 * is a Cloudflare Access JWT, verified against the team's keys for this
 * application's AUD (@repo/access-auth). A plain email header is never trusted,
 * and without the Access config every request is refused.
 */
export async function resolveIdentity(env: Env, claims: IdentityClaims): Promise<string | null> {
  if (env.ENVIRONMENT === 'development') {
    const candidate = claims.devCookie ?? env.DEV_ACCESS_IDENTITY ?? DEFAULT_DEV_IDENTITY;
    const email = candidate.trim().toLowerCase();
    return emailSchema.safeParse(email).success ? email : null;
  }

  const issuer = accessIssuer(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!issuer || !audience) {
    // Loud on purpose: a deploy without the config would otherwise just look signed out
    console.error(
      'Cloudflare Access is not configured (CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD): refusing the request'
    );
    return null;
  }
  const identity = await verifyAccessJwt(claims.accessJwt, {
    issuer,
    audience,
    keys: keysFor(issuer),
  });
  return identity?.email ?? null;
}
