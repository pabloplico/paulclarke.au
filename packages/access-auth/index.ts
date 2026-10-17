import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';

/**
 * Cloudflare Access identity, shared by the admin portal's demo and jobquest.
 *
 * Visitors sign in at Cloudflare Access (a one-time PIN to an allowed email), and
 * Access adds a signed JWT to every request it forwards, in the
 * Cf-Access-Jwt-Assertion header. verifyAccessJwt checks that JWT against the
 * team's published keys: signature (RS256 only), issuer, audience (the Access
 * application's AUD tag, so a token for another app on the same team is refused)
 * and expiry.
 *
 * Plain headers such as Cf-Access-Authenticated-User-Email are never trusted:
 * anyone who reaches the app without going through Cloudflare can set any header
 * they like. Only the signature proves Cloudflare issued the identity.
 *
 * No environment access and no Node-only imports: each app reads its own config
 * (process.env, Worker bindings) and passes it in, and this runs on Node and Workers.
 */

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export type AccessIdentity = { email: string };

/** `https://<team>.cloudflareaccess.com` from a configured team domain, or null when it's empty. */
export function accessIssuer(teamDomain: string | undefined): string | null {
  const team = teamDomain?.trim().replace(/\/+$/, '');
  if (!team) return null;
  return team.startsWith('https://') ? team : `https://${team}`;
}

/**
 * The team's published signing keys. jose caches them and refetches on an
 * unknown key id, so a key rotation needs no restart.
 */
export function accessKeySet(issuer: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
}

/**
 * The verified visitor, or null when there's no token, it doesn't verify, or it
 * has no email (service tokens don't: only people may sign in).
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
  options: { issuer: string; audience: string; keys: JWTVerifyGetKey }
): Promise<AccessIdentity | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, options.keys, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat'],
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email.includes('@')) return null;
    return { email };
  } catch {
    return null;
  }
}
