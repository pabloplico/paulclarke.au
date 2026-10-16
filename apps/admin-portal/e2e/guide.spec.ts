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

    // The guide's copy changed: it was "How to use the Admin Portal"
    const main = page.locator('main');
    await expect(main.getByRole('heading', { name: 'Getting Started', level: 1 })).toBeVisible();
    await expect(
      main.getByText('Typical workflow from workspace creation to gap analysis.')
    ).toBeVisible();
  });

  test('guide shows all feature cards', async ({ page }) => {
    await page.goto('/guide');
    await page.waitForLoadState('networkidle');

    // Scope to main content area to avoid sidebar matches
    const main = page.locator('main');

    // Should show feature cards for all major features
    await expect(main.getByRole('heading', { name: 'Workspaces' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
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

    await page.getByRole('link', { name: 'How to use this app' }).click();

    await expect(page).toHaveURL(/\/guide$/);
    await expect(
      page.locator('main').getByRole('heading', { name: 'Getting Started', level: 1 })
    ).toBeVisible();
  });
});
