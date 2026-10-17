import {
  ACCESS_JWT_HEADER,
  type AccessIdentity,
  accessIssuer,
  accessKeySet,
  verifyAccessJwt,
} from '@repo/access-auth';
import type { JWTVerifyGetKey } from 'jose';

/**
 * Cloudflare Access identity for the demo (DEMO_MODE=true): the admin portal's
 * config and dev bypass around the shared verification in @repo/access-auth
 * (which jobquest uses too). That checks the Cf-Access-Jwt-Assertion JWT against
 * the team's published keys (RS256 only, issuer, audience, expiry) and never
 * trusts plain headers such as Cf-Access-Authenticated-User-Email: anyone who
 * reaches the app without going through Cloudflare (for example at its Cloud Run
 * URL) can set any header they like.
 *
 * Config (both required in demo mode):
 * - CF_ACCESS_TEAM_DOMAIN: https://<team>.cloudflareaccess.com (the issuer)
 * - CF_ACCESS_AUD: the application's AUD tag
 *
 * DEV_ACCESS_IDENTITY=<email> skips verification for local development and
 * tests. It refuses to work when NODE_ENV=production.
 *
 * No Node-only imports: the middleware runs this on every request.
 */

export type { AccessIdentity };
export { ACCESS_JWT_HEADER };

export class AccessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessConfigError';
  }
}

/** The dev bypass email, or null. Throws if it's set in production. */
export function devAccessIdentity(): string | null {
  const email = process.env.DEV_ACCESS_IDENTITY?.trim();
  if (!email) return null;
  if (process.env.NODE_ENV === 'production') {
    throw new AccessConfigError(
      'DEV_ACCESS_IDENTITY is set while NODE_ENV=production. It bypasses Cloudflare Access verification and is for local development only.'
    );
  }
  return email.toLowerCase();
}

function accessConfig(): { issuer: string; audience: string } {
  const issuer = accessIssuer(process.env.CF_ACCESS_TEAM_DOMAIN);
  const audience = process.env.CF_ACCESS_AUD?.trim();
  if (!issuer || !audience) {
    throw new AccessConfigError(
      'Demo mode needs CF_ACCESS_TEAM_DOMAIN (https://<team>.cloudflareaccess.com) and CF_ACCESS_AUD (the Access application AUD tag)'
    );
  }
  return { issuer, audience };
}

/** Checks the config is complete (start-up check). */
export function assertAccessConfig(): void {
  if (devAccessIdentity()) return;
  accessConfig();
}

const g = globalThis as unknown as { _accessJwks?: { issuer: string; keys: JWTVerifyGetKey } };

function keySet(issuer: string): JWTVerifyGetKey {
  // createRemoteJWKSet caches keys and refetches on an unknown kid (rotation)
  if (g._accessJwks?.issuer !== issuer) {
    g._accessJwks = { issuer, keys: accessKeySet(issuer) };
  }
  return g._accessJwks.keys;
}

/** Tests only: verify against a local key set instead of Cloudflare's. */
export function setAccessKeySetForTests(keys: JWTVerifyGetKey | null): void {
  g._accessJwks = keys ? { issuer: accessConfig().issuer, keys } : undefined;
}

/**
 * The verified visitor, or null when the request carries no valid Access
 * token. Throws AccessConfigError when the configuration is incomplete.
 */
export async function verifyAccessRequest(headers: Headers): Promise<AccessIdentity | null> {
  const devEmail = devAccessIdentity();
  if (devEmail) return { email: devEmail };

  const { issuer, audience } = accessConfig();
  const token = headers.get(ACCESS_JWT_HEADER);
  if (!token) return null;

  // Service-token JWTs have no email, so they're refused: only people may use the demo
  return verifyAccessJwt(token, { issuer, audience, keys: keySet(issuer) });
}
