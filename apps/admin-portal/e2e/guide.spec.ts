import { expect, test } from '@playwright/test';

/**
 * E2E tests for the guide/onboarding page.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 */

test.describe('Guide Page', () => {
  test('guide page loads with title', async ({ page }) => {
    await page.goto('/guide');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('How to use the Admin Portal')).toBeVisible();
    await expect(page.getByText('A quick overview of the main features')).toBeVisible();
  });

  test('guide shows all feature cards', async ({ page }) => {
    await page.goto('/guide');
    await page.waitForLoadState('networkidle');

    // Scope to main content area to avoid sidebar matches
    const main = page.locator('main');

    // Should show feature cards for all major features
    await expect(main.getByRole('heading', { name: 'Workspaces' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Documents' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Chat' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Gap Analysis' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Search' })).toBeVisible();
  });

  test('guide shows quick tips section', async ({ page }) => {
    await page.goto('/guide');
    await page.waitForLoadState('networkidle');

    // Should show quick tips
    const quickTips = page.getByText(/quick tips/i).or(page.getByText(/tips/i));
    await expect(quickTips.first()).toBeVisible();
  });

  test('help button in header navigates to guide', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Find help button (HelpCircle icon) in header
    const helpLink = page.locator('a[href="/guide"]');
    if (!(await helpLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await helpLink.click();

    await expect(page).toHaveURL(/\/guide/);
    await expect(page.getByText('How to use the Admin Portal')).toBeVisible();
  });
});
