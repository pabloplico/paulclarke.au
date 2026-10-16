import { expect, test } from '@playwright/test';

/**
 * E2E tests for knowledge base management.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *
 * Serial: the knowledge base created first is opened and then deleted.
 */

const KB_NAME = `E2E Test KB ${Date.now()}`;

test.describe('Knowledge Base', () => {
  test.describe.configure({ mode: 'serial' });

  test('knowledge base page loads', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'New Knowledge Base' })).toBeVisible();
  });

  test('create knowledge base', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'New Knowledge Base' }).click();
    await page.getByRole('textbox', { name: 'Knowledge base name' }).fill(KB_NAME);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByText(`${KB_NAME} created`)).toBeVisible();
    await expect(page.getByRole('heading', { name: KB_NAME, level: 3, exact: true })).toBeVisible();
  });

  test('knowledge base detail shows chunks info', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    await page.getByRole('heading', { name: KB_NAME, level: 3, exact: true }).click();

    await expect(page).toHaveURL(/\/knowledge-base\/\d+$/);
    await expect(page.getByRole('heading', { name: KB_NAME, level: 2 })).toBeVisible();
    // A new knowledge base is empty
    await expect(page.locator('main')).toContainText(/0 chunks\s*0 documents/);
    await expect(page.getByRole('button', { name: 'Add Chunks' })).toBeVisible();
  });

  test('delete knowledge base', async ({ page }) => {
    await page.goto('/knowledge-base');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: `Delete ${KB_NAME}`, exact: true }).click();

    await expect(page.getByText(`${KB_NAME} deleted`)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'New Knowledge Base' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: KB_NAME, level: 3, exact: true })
    ).not.toBeVisible();
  });
});
