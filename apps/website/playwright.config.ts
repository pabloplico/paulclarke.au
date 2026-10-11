import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
const baseURL = `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * E2E tests run against the production build served by `wrangler dev` (workerd), so they
 * exercise the real Worker, the SPA deep-link fallback and the _headers file. No database
 * or secrets are needed.
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
    command: `pnpm build && pnpm exec wrangler dev --port ${PORT} --ip 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
