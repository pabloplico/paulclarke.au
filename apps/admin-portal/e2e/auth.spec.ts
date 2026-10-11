import { expect, test } from '@playwright/test';

/**
 * E2E tests for authentication flow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - AUTH_SECRET is set (auth middleware active)
 */

const TEST_EMAIL = `e2e-auth-${Date.now()}@test.com`;
const TEST_PASSWORD = 'testpassword123';
const TEST_NAME = 'E2E Auth Test';

test.describe('Authentication', () => {
  test.describe.configure({ mode: 'serial' });

  test('login page renders with form fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Admin Portal')).toBeVisible();
    await expect(page.getByText('Sign in to continue')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#email').fill('nonexistent@test.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should show error message
    await expect(page.locator('.bg-destructive\\/10')).toBeVisible({ timeout: 5_000 });
  });

  test('login with empty fields does not submit', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should still be on login page (HTML5 validation prevents submit)
    await expect(page).toHaveURL(/\/login/);
  });

  test('signup page renders with form fields', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByText('Get started with the Admin Portal')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('signup creates account and redirects to workspaces', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.locator('#name').fill(TEST_NAME);
    await page.locator('#email').fill(TEST_EMAIL);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should redirect to workspaces after successful signup
    await expect(page).toHaveURL(/\/workspaces/, { timeout: 10_000 });
  });

  test('signup with existing email shows error', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.locator('#name').fill('Duplicate User');
    await page.locator('#email').fill(TEST_EMAIL);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should show error about existing account
    await expect(page.locator('.bg-destructive\\/10')).toBeVisible({ timeout: 5_000 });
  });

  test('signup with short password shows error', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.locator('#name').fill('Short Pass');
    await page.locator('#email').fill(`short-${Date.now()}@test.com`);
    await page.locator('#password').fill('12345');

    // HTML5 minLength=6 validation or server-side error
    await page.getByRole('button', { name: 'Create account' }).click();

    // Either stays on page or shows error
    await page.waitForTimeout(1_000);
    const url = page.url();
    const hasError = await page
      .locator('.bg-destructive\\/10')
      .isVisible()
      .catch(() => false);
    expect(url.includes('/signup') || hasError).toBe(true);
  });

  test('login with valid credentials redirects to workspaces', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#email').fill(TEST_EMAIL);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/workspaces/, { timeout: 10_000 });
  });

  test('logout redirects to login page', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('#email').fill(TEST_EMAIL);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/workspaces/, { timeout: 10_000 });

    // Click logout button in header
    const logoutBtn = page.locator('button').filter({ has: page.locator('svg.lucide-log-out') });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    // Clear cookies to ensure no session
    await page.context().clearCookies();

    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('navigate between login and signup pages', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Go to signup
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/signup/);

    // Go back to login
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
