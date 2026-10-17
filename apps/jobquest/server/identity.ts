import { z } from 'zod';
import type { Env } from './env';

/**
 * Development only: picks the identity per browser, so each E2E test (and anyone
 * trying two visitors locally) gets a profile of its own.
 */
export const DEV_IDENTITY_COOKIE = 'jq-dev-identity';
const DEFAULT_DEV_IDENTITY = 'dev@localhost.test';

const emailSchema = z.email();

/**
 * The visitor's email, lower-cased, or null when nobody is signed in.
 *
 * Until Cloudflare Access verification arrives (IMPORT_PLAN J5) there is no way to
 * sign in outside development: in production every /api request gets a 401. In
 * development the identity comes from the cookie above, then DEV_ACCESS_IDENTITY,
 * then dev@localhost.test. A plain email header is never trusted.
 */
export function resolveIdentity(env: Env, devCookie: string | undefined): string | null {
  if (env.ENVIRONMENT !== 'development') return null;
  const candidate = devCookie ?? env.DEV_ACCESS_IDENTITY ?? DEFAULT_DEV_IDENTITY;
  const email = candidate.trim().toLowerCase();
  return emailSchema.safeParse(email).success ? email : null;
}
