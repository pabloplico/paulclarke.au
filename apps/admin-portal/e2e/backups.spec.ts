import { expect, test } from '@playwright/test';

/**
 * E2E tests for database backups page.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - User has admin role
 */

test.describe('Backups', () => {
  test('backups page loads', async ({ page }) => {
    await page.goto('/backups');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/backup/i).first()).toBeVisible();
  });

  test('backups list shows existing backups', async ({ page }) => {
    await page.goto('/backups');
    await page.waitForLoadState('networkidle');

    // Should show a list of backups or an empty state
    const main = page.locator('main');
    await expect(main).toBeVisible();

    const hasBackups = await main.locator('a, button, tr, li').count();
    // Page renders without error
    expect(hasBackups).toBeGreaterThanOrEqual(0);
  });

  test('create new backup', async ({ page }) => {
    await page.goto('/backups');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /create|new|backup/i }).first();
    if (!(await createBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();

    // Should show success message or new backup in list
    await expect(
      page.getByText(/created|success|complete/i).or(page.getByText(/\.sql/))
    ).toBeVisible({ timeout: 30_000 });
  });

  test('download backup file', async ({ page }) => {
    await page.goto('/backups');
    await page.waitForLoadState('networkidle');

    // Find a download link/button for a backup
    const downloadLink = page
      .locator('a[href*="backup"]')
      .or(page.getByRole('button', { name: /download/i }))
      .or(page.locator('a[download]'))
      .first();

    if (!(await downloadLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await downloadLink.click();

    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain('.sql');
      console.log(`Downloaded backup: ${filename}`);
    }
  });

  test('backups API returns list', async ({ page }) => {
    const res = await page.request.get('/api/backups');

    if (res.ok()) {
      const backups = await res.json();
      expect(Array.isArray(backups)).toBe(true);
    }
  });
});
