import { expect, test } from '@playwright/test';

/**
 * Pre-conditions: the E2E user from auth.setup.ts, with the Getting Started
 * workspace every new account gets and the E2E Test Workspace.
 */

test.describe('Workspaces', () => {
  test('workspace list shows the user’s workspaces', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Getting Started/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^E2E Test Workspace/ })).toBeVisible();
  });

  test('create workspace from template', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'New Workspace' }).click();

    await expect(page.getByRole('heading', { name: 'Choose a Template' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Client Project/ })).toBeVisible();
  });

  test('open workspace and view sections', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: /^E2E Test Workspace/ }).click();

    await expect(page).toHaveURL(/\/workspaces\/e2e-test-workspace$/);
    await expect(
      page.locator('main').getByRole('heading', { name: 'Project Overview', level: 3 })
    ).toBeVisible();
  });

  test('Ctrl+K focuses search and accepts input', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();

    await page.keyboard.press('Control+k');

    const input = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(input).toBeFocused();
    await input.fill('services');
    await expect(input).toHaveValue('services');
  });
});
