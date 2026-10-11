import { expect, test as setup } from '@playwright/test';

/**
 * Global setup: create a dedicated test account, seed a test workspace,
 * and save storage state. Uses a separate user so E2E tests don't
 * interfere with real accounts.
 */

const AUTH_FILE = 'e2e/.auth/user.json';
const TEST_EMAIL = 'e2e-test@playwright.local';
const TEST_PASSWORD = 'e2eTestPass123';
const TEST_NAME = 'E2E Test User';

setup('authenticate', async ({ page }) => {
  // Try to sign up a dedicated test account (idempotent — will fail if already exists)
  await page.request.post('/api/auth/signup', {
    data: { name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASSWORD },
  });

  // Log in
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('#email').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL(/\/workspaces/, { timeout: 10_000 });

  // Seed a test workspace with prose sections if it doesn't already exist
  const listRes = await page.request.get('/api/workspaces');
  const workspaces = await listRes.json();
  const hasTestWs = workspaces.some((w: { slug: string }) => w.slug === 'e2e-test-workspace');

  if (!hasTestWs) {
    const createRes = await page.request.post('/api/workspaces', {
      data: {
        title: 'E2E Test Workspace',
        slug: 'e2e-test-workspace',
        description: 'Workspace seeded for E2E testing',
        templateId: 'client-project',
        icon: 'briefcase',
      },
    });
    expect(createRes.ok()).toBe(true);
  }

  // Save signed-in state
  await page.context().storageState({ path: AUTH_FILE });
});
