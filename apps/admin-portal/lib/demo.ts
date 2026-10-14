/**
 * Demo mode: the single source of truth for what the public demo switches off.
 *
 * DEMO_MODE=true turns it on. It's read at request time (never inlined at
 * build time), so one image serves both modes. No Node-only imports: the
 * middleware runs this on every request.
 *
 * Every page and API route in app/ has an entry in ROUTES, either 'core'
 * (always on) or the feature it belongs to. lib/demo.test.ts fails if a
 * route file has no entry, so a new route can't go live in the demo by
 * accident.
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

/** Features the demo switches off, with why. */
export const DEMO_DISABLED_FEATURES = {
  backups: 'Database dumps of every user’s data',
  feeds: 'Fetches arbitrary feed URLs on a schedule',
  research: 'Autonomous research agents: outbound fetches, long AI runs, cron schedules',
  outreach: 'AI-personalised email drafts',
  companyLookup: 'Paid third-party lookups (ABN, Google Places, company search)',
  communications: 'Client communications log',
  emailTemplates: 'Email templates',
  scheduler: 'Agent schedules',
  settings: 'Global settings shared by every user, including the AI model',
  modelSelection: 'Lists provider models and calls provider APIs with server keys',
  contentAudit: 'Fetches posts from another service',
  bulkReprocess: 'Re-runs the AI pipeline on every document at once',
  passwordAccounts: 'Visitors sign in through Cloudflare Access, not app passwords',
} as const;

export type DemoFeature = keyof typeof DEMO_DISABLED_FEATURES;
type RouteFeature = DemoFeature | 'core';

/**
 * Route patterns, written like the app/ folders they come from (route groups
 * removed). `[param]` matches one segment; a trailing `/**` matches the route
 * and everything under it. The most specific (longest) matching pattern wins.
 */
export const ROUTES: Record<string, RouteFeature> = {
  // Pages
  '/': 'core',
  '/workspaces/**': 'core',
  '/inbox/**': 'core',
  '/gap-analysis/**': 'core',
  '/documents/**': 'core',
  '/knowledge-base/**': 'core',
  '/guide/**': 'core',
  '/clients/**': 'core',
  '/jobs/**': 'core',
  '/todos/**': 'core',
  '/login/**': 'passwordAccounts',
  '/signup/**': 'passwordAccounts',
  '/backups/**': 'backups',
  '/feeds/**': 'feeds',
  '/communications/**': 'communications',
  '/email-templates/**': 'emailTemplates',
  '/scheduler/**': 'scheduler',
  '/settings/**': 'settings',

  // API
  '/api/auth/me': 'core',
  '/api/auth/login': 'passwordAccounts',
  '/api/auth/logout': 'passwordAccounts',
  '/api/auth/signup': 'passwordAccounts',
  '/api/workspaces/**': 'core',
  '/api/workspaces/[id]/research/**': 'research',
  '/api/inbox/**': 'core',
  '/api/documents/**': 'core',
  '/api/documents/reprocess-all': 'bulkReprocess',
  '/api/chat/**': 'core',
  '/api/find-source/**': 'core',
  '/api/search/**': 'core',
  '/api/kb-chunks/**': 'core',
  '/api/knowledge-bases/**': 'core',
  '/api/sections/**': 'core',
  '/api/clients/**': 'core',
  '/api/contacts/**': 'core',
  '/api/jobs/**': 'core',
  '/api/todos/**': 'core',
  // GET is core; PATCH is refused in demo mode (see isDemoRequestBlocked)
  '/api/settings': 'core',
  '/api/backups/**': 'backups',
  '/api/feeds/**': 'feeds',
  '/api/outreach/**': 'outreach',
  '/api/lookup/**': 'companyLookup',
  '/api/communications/**': 'communications',
  '/api/email-templates/**': 'emailTemplates',
  '/api/models/**': 'modelSelection',
  '/api/content-audit/**': 'contentAudit',
};

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Whether `pattern` matches `pathname`, segment by segment. */
export function matchesRoute(pattern: string, pathname: string): boolean {
  const deep = pattern.endsWith('/**');
  const want = segments(deep ? pattern.slice(0, -3) : pattern);
  const have = segments(pathname);
  if (deep ? have.length < want.length : have.length !== want.length) return false;
  return want.every((part, i) => (part.startsWith('[') && part.endsWith(']')) || part === have[i]);
}

/** The feature a path belongs to, or undefined if no route pattern matches it. */
export function routeFeature(pathname: string): RouteFeature | undefined {
  let best: { length: number; feature: RouteFeature } | undefined;
  for (const [pattern, feature] of Object.entries(ROUTES)) {
    if (!matchesRoute(pattern, pathname)) continue;
    const length = segments(pattern).length + (pattern.endsWith('/**') ? 0 : 0.5);
    if (!best || length > best.length) best = { length, feature };
  }
  return best?.feature;
}

/** True when demo mode is on and the path belongs to a switched-off feature. */
export function isDemoRouteDisabled(pathname: string): boolean {
  if (!isDemoMode()) return false;
  const feature = routeFeature(pathname);
  return feature !== undefined && feature !== 'core';
}

/**
 * Requests refused in demo mode even though their route is on: changing the
 * global settings. Returns the reason, or null if the request may proceed.
 */
export function isDemoRequestBlocked(pathname: string, method: string): string | null {
  if (!isDemoMode()) return null;
  if (method !== 'GET' && method !== 'HEAD' && matchesRoute('/api/settings', pathname)) {
    return 'Settings are read-only in the demo';
  }
  return null;
}

/** Sidebar and link filter: whether a page link should be shown. */
export function isDemoLinkVisible(href: string): boolean {
  return !isDemoRouteDisabled(href);
}

/** What client components need to know, passed down from the server layout. */
export function demoClientState(): { demoMode: boolean; disabled: DemoFeature[] } {
  const demoMode = isDemoMode();
  return {
    demoMode,
    disabled: demoMode ? (Object.keys(DEMO_DISABLED_FEATURES) as DemoFeature[]) : [],
  };
}
