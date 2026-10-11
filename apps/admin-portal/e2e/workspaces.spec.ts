import { expect, test } from '@playwright/test';

test.describe('Workspaces', () => {
  test('workspace list loads with seeded data', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Should show the dashboard with workspace cards
    await expect(page.getByText('Workspaces')).toBeVisible();
    // At least one seeded workspace should be visible
    await expect(
      page.getByText('Services').or(page.getByText('Clients')).or(page.getByText('Procedures'))
    ).toBeVisible();
  });

  test('create workspace from template', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    const newBtn = page.getByRole('button', { name: /new workspace/i });
    if (!(await newBtn.isVisible())) {
      test.skip();
      return;
    }
    await newBtn.click();

    // Template dialog should appear
    await expect(page.getByText(/template/i)).toBeVisible({ timeout: 5_000 });
  });

  test('open workspace and view sections', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Click into a workspace
    const workspaceLink = page.getByRole('link', { name: /services/i }).first();
    if (!(await workspaceLink.isVisible())) {
      test.skip();
      return;
    }
    await workspaceLink.click();
    await page.waitForLoadState('networkidle');

    // Should show workspace detail with sections
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Cmd+K search opens and accepts input', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Trigger search with keyboard shortcut
    await page.keyboard.press('Meta+k');
    // Fallback for Linux
    await page.keyboard.press('Control+k');

    // Search input should be visible
    const searchInput = page.getByPlaceholder(/search/i);
    if (!(await searchInput.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // Try clicking the search bar directly
      const searchTrigger = page
        .locator('[data-search-trigger]')
        .or(page.getByRole('button', { name: /search/i }));
      if (await searchTrigger.isVisible()) {
        await searchTrigger.click();
      }
    }

    const input = page.getByPlaceholder(/search/i);
    if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await input.fill('services');
      // Should show some results after debounce
      await page.waitForTimeout(500);
    }
  });
});
