import { expect, type Page, test } from '@playwright/test';

/** Adds a note to the inbox through the drop zone and waits for its card. */
async function addNote(page: Page, title: string) {
  await page.getByRole('textbox', { name: 'Note title' }).fill(title);
  await page
    .getByRole('textbox', { name: 'Paste or type your notes here...' })
    .fill('A note added by the E2E tests.');
  await page.getByRole('button', { name: 'Add Note' }).click();
  await expect(page.getByRole('heading', { name: title, level: 4 })).toBeVisible();
}

test.describe('Inbox', () => {
  test('inbox page loads', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  });

  test('drop zone offers notes, files and URLs', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Drop Zone' })).toBeVisible();
    for (const kind of ['Note', 'File', 'Url']) {
      await expect(page.getByRole('button', { name: kind, exact: true })).toBeVisible();
    }
  });

  test('inbox items can be dismissed', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    const title = `E2E dismiss ${Date.now()}`;
    await addNote(page, title);

    // The item's dismiss button has only an X icon, no accessible name
    const item = page
      .locator('main div')
      .filter({ has: page.getByRole('heading', { name: title, level: 4 }) })
      .filter({ has: page.locator('button svg.lucide-x') })
      .last();
    const dismissed = page.waitForResponse(
      (res) => res.url().includes('/dismiss') && res.request().method() === 'POST'
    );
    await item.locator('button:has(svg.lucide-x)').click();

    expect((await dismissed).ok()).toBe(true);
    await expect(item.locator('button:has(svg.lucide-x)')).toHaveCount(0);
  });
});
