import { defineConfig, devices } from '@playwright/test';

// Not the website's 8788: CI's E2E job starts both apps' servers at once
const PORT = 8790;
const baseURL = `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);
const STATE = '.wrangler/e2e';

/**
 * E2E tests run against the production build served by `wrangler dev` (workerd):
 * the real Worker, D1 (a fresh local database each run), the SPA deep-link
 * fallback and the _headers file. ENVIRONMENT=development turns on the dev
 * identity cookie, which gives every test a visitor (and seeded profile) of its
 * own (e2e/fixtures.ts). No secrets are needed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: [
      `rm -rf ${STATE}`,
      'pnpm exec nx run jobquest:build',
      `pnpm exec wrangler d1 migrations apply jobquest --local --persist-to ${STATE}`,
      `pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1 --persist-to ${STATE} --var ENVIRONMENT:development`,
    ].join(' && '),
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
