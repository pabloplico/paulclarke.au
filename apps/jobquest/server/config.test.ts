// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Without the Access config the Worker refuses every request, and with workers.dev or
// preview URLs on there'd be a way in that skips Access. Both would only show after a
// deploy, so the deployed config is checked here.
const config = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../wrangler.jsonc'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1')
);

describe('the deployed Worker config (wrangler.jsonc)', () => {
  it('runs in production with Cloudflare Access configured', () => {
    expect(config.vars.ENVIRONMENT).toBe('production');
    expect(config.vars.CF_ACCESS_TEAM_DOMAIN).toMatch(/^[a-z0-9-]+\.cloudflareaccess\.com$/);
    expect(config.vars.CF_ACCESS_AUD).toMatch(/^[0-9a-f]{64}$/);
    expect(config.vars.DEV_ACCESS_IDENTITY).toBeUndefined();
  });

  it('is reachable only at its custom domain', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toEqual([{ pattern: 'jobquest.paulclarke.au', custom_domain: true }]);
  });
});
