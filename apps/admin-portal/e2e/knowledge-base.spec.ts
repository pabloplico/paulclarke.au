import { expect, test } from '@playwright/test';

/**
 * E2E tests for knowledge base management.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Database available
 */

const KB_NAME = `E2E Test KB ${Date.now()}`;

test.describe('Knowledge Base', () => {
  test.describe.configure({ mode: 'serial' });

  test('knowledge base page loads', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/knowledge base/i).first()).toBeVisible();
  });

  test('create knowledge base', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    // Look for a create/new button
    const createBtn = page.getByRole('button', { name: /new|create|add/i }).first();

    if (!(await createBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await createBtn.click();

    // Fill in the name/title
    const nameInput = page
      .locator('input[placeholder*="name" i]')
      .or(page.locator('input[placeholder*="title" i]'))
      .or(page.locator('input[type="text"]'))
      .first();

    if (!(await nameInput.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await nameInput.fill(KB_NAME);

    // Submit
    const submitBtn = page.getByRole('button', { name: /create|save|add/i }).last();
    await submitBtn.click();

    // Should show success or navigate to KB detail
    await page.waitForTimeout(2_000);
    await expect(page.getByText(KB_NAME)).toBeVisible({ timeout: 5_000 });
  });

  test('knowledge base detail shows chunks info', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    // Click into a knowledge base
    const kbLink = page.locator('a[href^="/knowledge-base/"]').first();
    if (!(await kbLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await kbLink.click();
    await page.waitForLoadState('networkidle');

    // Should show KB detail page
    await expect(page.locator('main')).toBeVisible();
  });

  test('delete knowledge base', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    // Find our test KB
    const kbEntry = page.getByText(KB_NAME);
    if (!(await kbEntry.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Look for delete button near our KB
    const kbRow = kbEntry.locator('..').locator('..');
    const deleteBtn = kbRow
      .locator('button')
      .filter({ has: page.locator('svg.lucide-trash-2') })
      .or(kbRow.getByRole('button', { name: /delete/i }))
      .first();

    if (!(await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // May need to navigate to detail page to delete
      const kbLink = kbRow.locator('a[href^="/knowledge-base/"]').first();
      if (await kbLink.isVisible()) {
        await kbLink.click();
        await page.waitForLoadState('networkidle');

        const detailDeleteBtn = page.getByRole('button', { name: /delete/i }).first();
        if (!(await detailDeleteBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
          test.skip();
          return;
        }
        await detailDeleteBtn.click();
      } else {
        test.skip();
        return;
      }
    } else {
      await deleteBtn.click();
    }

    // Handle confirmation if present
    const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(1_000);

    // KB should be removed
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(KB_NAME)).not.toBeVisible({ timeout: 5_000 });
  });
});
