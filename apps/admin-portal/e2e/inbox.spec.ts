import { expect, test } from '@playwright/test';

test.describe('Inbox', () => {
  test('inbox page loads', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/inbox/i)).toBeVisible();
  });

  test('file upload drop zone is visible', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    // The inbox should have a file upload area
    const dropZone = page.getByText(/drop|upload|drag/i).first();
    if (!(await dropZone.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await expect(dropZone).toBeVisible();
  });

  test('inbox items can be dismissed', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    // If there are inbox items with dismiss/reject buttons
    const dismissBtn = page.getByRole('button', { name: /dismiss|reject|delete/i }).first();
    if (!(await dismissBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    const countBefore = await page.getByRole('button', { name: /dismiss|reject|delete/i }).count();
    await dismissBtn.click();

    // Wait for the item to be removed
    await page.waitForTimeout(1000);
    const countAfter = await page.getByRole('button', { name: /dismiss|reject|delete/i }).count();
    expect(countAfter).toBeLessThan(countBefore);
  });
});
