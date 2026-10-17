import type { DrizzleD1Database } from 'drizzle-orm/d1';

export interface Env {
  DB: D1Database;
  /** 'development' only from .dev.vars or `wrangler dev --var`; wrangler.jsonc sets 'production'. */
  ENVIRONMENT?: string;
  /** Stands in for the Cloudflare Access identity locally. Ignored unless ENVIRONMENT is 'development'. */
  DEV_ACCESS_IDENTITY?: string;
  /** The Access team, `<team>.cloudflareaccess.com`: the JWT's issuer (wrangler.jsonc). */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's AUD tag: the JWT's audience (wrangler.jsonc). */
  CF_ACCESS_AUD?: string;
}

export interface Profile {
  id: string;
  email: string;
}

/** Hono's types for every /api route behind the identity middleware. */
export interface AppEnv {
  Bindings: Env;
  Variables: { db: DrizzleD1Database; profile: Profile };
}
