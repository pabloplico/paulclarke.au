import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isDemoRequestBlocked,
  isDemoRouteDisabled,
  matchesRoute,
  ROUTES,
  routeFeature,
} from './demo';

const appDir = join(__dirname, '..', 'app');

/** Every page and API route in app/, as a URL pattern (route groups removed). */
function routeFiles(dir = appDir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routeFiles(path));
    else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
      const parts = relative(appDir, dir)
        .split(sep)
        .filter((part) => part && !(part.startsWith('(') && part.endsWith(')')));
      found.push(`/${parts.join('/')}`);
    }
  }
  return found;
}

const saved = process.env.DEMO_MODE;
afterEach(() => {
  if (saved === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = saved;
});

describe('demo route table', () => {
  it('classifies every page and API route in app/ (fails closed for new routes)', () => {
    const files = routeFiles();
    expect(files.length).toBeGreaterThan(100);
    const unclassified = files.filter((route) => routeFeature(route) === undefined);
    expect(unclassified).toEqual([]);
  });

  it('has no pattern that matches nothing', () => {
    const files = routeFiles();
    const unused = Object.keys(ROUTES).filter(
      (pattern) => !files.some((route) => matchesRoute(pattern, route))
    );
    expect(unused).toEqual([]);
  });

  it('matches whole segments only', () => {
    expect(matchesRoute('/api/communications/**', '/api/communications')).toBe(true);
    expect(matchesRoute('/api/communications/**', '/api/communications/12/notes')).toBe(true);
    expect(matchesRoute('/api/communications/**', '/api/communicationsX')).toBe(false);
    expect(matchesRoute('/api/settings', '/api/settings/extra')).toBe(false);
  });

  it('lets the most specific pattern win', () => {
    expect(routeFeature('/api/workspaces/7/sections')).toBe('core');
    expect(routeFeature('/api/workspaces/7/research/agent-runs')).toBe('research');
    expect(routeFeature('/api/documents/12')).toBe('core');
    expect(routeFeature('/api/documents/reprocess-all')).toBe('bulkReprocess');
  });
});

describe('demo mode', () => {
  it('switches nothing off when DEMO_MODE is not exactly "true"', () => {
    for (const value of [undefined, '', 'false', '1', 'TRUE']) {
      if (value === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = value;
      expect(isDemoRouteDisabled('/api/communications')).toBe(false);
      expect(isDemoRequestBlocked('/api/settings', 'PATCH')).toBeNull();
    }
  });

  it('switches off the brief’s features, pages and APIs alike', () => {
    process.env.DEMO_MODE = 'true';
    for (const path of [
      '/api/workspaces/1/research/agent-tasks/2/trigger',
      '/api/workspaces/1/research/agent-runs/9/cancel',
      '/api/outreach/personalise',
      '/api/lookup/company',
      '/communications',
      '/api/communications/4',
      '/email-templates',
      '/api/email-templates',
      '/scheduler',
      '/settings',
      '/api/models',
      '/api/content-audit',
      '/api/documents/reprocess-all',
      '/login',
      '/signup',
      '/api/auth/signup',
      '/api/auth/login',
    ]) {
      expect(isDemoRouteDisabled(path), path).toBe(true);
    }
  });

  it('keeps both showcase flows on', () => {
    process.env.DEMO_MODE = 'true';
    for (const path of [
      '/',
      '/inbox',
      '/api/inbox',
      '/api/inbox/5/approve',
      '/workspaces/acme',
      '/api/workspaces/1/sections/2/ai-edit',
      '/api/workspaces/1/sections/2/versions/3/restore',
      '/api/find-source',
      '/api/auth/me',
      '/api/settings',
    ]) {
      expect(isDemoRouteDisabled(path), path).toBe(false);
    }
  });

  it('allows reading settings but not changing them', () => {
    process.env.DEMO_MODE = 'true';
    expect(isDemoRequestBlocked('/api/settings', 'GET')).toBeNull();
    for (const method of ['PATCH', 'PUT', 'POST', 'DELETE']) {
      expect(isDemoRequestBlocked('/api/settings', method)).toMatch(/read-only/);
    }
  });
});
