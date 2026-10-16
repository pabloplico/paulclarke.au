import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // A committed test.only would silently skip the rest of the suite in CI
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL,
    // With retries at 0, 'on-first-retry' never records anything. Keep the
    // trace of every failed test instead
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'auth-tests',
      testMatch: /auth\.spec\.ts/,
      // Auth tests manage their own sessions — no dependency on setup
    },
    {
      name: 'tests',
      testIgnore: /auth\.(setup|spec)\.ts/,
      dependencies: ['setup'],
      use: {
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
  webServer: {
    // The full stack on the host: .env.docker against Postgres + Redis (see CLAUDE.md)
    command: 'pnpm dev:full',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
