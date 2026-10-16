import { defineConfig } from '@playwright/test';
import { FAKE_OPENAI_PORT, FAKE_OPENAI_URL } from './test/fake-openai/constants';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Two workers: the default (half the cores) maxes out a dev laptop with a
  // Next dev server and a browser per worker, and isn't much faster
  workers: 2,
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
  // Fails the run if the stub OpenAI server got a request it had no reply for:
  // some call sites swallow AI errors, so a test alone might not notice
  globalTeardown: './e2e/global-teardown.ts',
  webServer: [
    {
      // A stub of the OpenAI API (test/fake-openai): canned replies keyed by
      // the prompt, deterministic embeddings, and a 500 for anything else
      command: 'pnpm exec tsx test/fake-openai/main.ts',
      env: { FAKE_OPENAI_PORT: String(FAKE_OPENAI_PORT) },
      url: `${FAKE_OPENAI_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // dev:lite (PGlite, in-process jobs, no services) with sign-in on and a
      // fresh database every run. AI calls go to the stub, through the real
      // OpenAI provider and the AI guard; both models are priced, so the guard
      // records their spend. Its own build folder, so it doesn't clash with a
      // dev:lite already using .next/dev
      command: 'rm -rf .pglite/e2e && pnpm dev:lite',
      env: {
        AUTH_ENABLED: 'true',
        AUTH_SECRET: 'e2e-only-secret-never-used-outside-playwright-0123456789',
        PGLITE_DATA_DIR: '.pglite/e2e/data',
        UPLOADS_DIR: '.pglite/e2e/uploads',
        NEXT_DIST_DIR: '.next/e2e',
        AI_PROVIDER: 'openai',
        AI_MODEL: 'gpt-4.1-mini',
        OPENAI_API_KEY: 'e2e-fake-key',
        OPENAI_BASE_URL: `${FAKE_OPENAI_URL}/v1`,
        // Every AI test runs as the one E2E user, well past the default 30
        // requests in 10 minutes
        AI_USER_REQUESTS: '1000',
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
