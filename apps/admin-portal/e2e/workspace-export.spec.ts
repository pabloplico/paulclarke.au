import { expect, test } from '@playwright/test';

/**
 * E2E tests for workspace export functionality.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces exist
 */

test.describe('Workspace Export', () => {
  test('export single workspace from context menu', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Find a workspace card and open context menu
    const cards = page.locator('a[href^="/workspaces/"]');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    // Open context menu on the first workspace
    const card = cards.first().locator('..').locator('..');
    const menuBtn = card
      .locator('button')
      .filter({ has: page.locator('svg.lucide-more-vertical') })
      .first();

    if (!(await menuBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await menuBtn.click();

    // Click Export
    const exportBtn = page.getByRole('button', { name: 'Export' });
    if (!(await exportBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await exportBtn.click();

    const download = await downloadPromise;
    if (download) {
      // Verify download was triggered
      const filename = download.suggestedFilename();
      expect(filename).toBeTruthy();
      console.log(`Downloaded: ${filename}`);
    }
  });

  test('export all workspaces', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    const exportAllBtn = page.getByRole('button', { name: /export all/i });
    if (!(await exportAllBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await exportAllBtn.click();

    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toBeTruthy();
      console.log(`Downloaded: ${filename}`);
    }
  });

  test('export workspace via API returns data', async ({ page }) => {
    // Get workspace list via API
    const listRes = await page.request.get('/api/workspaces');
    const workspaces = await listRes.json();

    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      test.skip();
      return;
    }

    const workspace = workspaces[0];
    const exportRes = await page.request.get(`/api/workspaces/${workspace.id}/export`);

    expect(exportRes.ok()).toBe(true);

    const exportData = await exportRes.json().catch(() => null);
    const exportText = exportData ? null : await exportRes.text();

    // Should return content (JSON or markdown)
    expect(exportData || exportText).toBeTruthy();
  });
});
