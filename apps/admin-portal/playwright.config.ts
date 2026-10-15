import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
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
