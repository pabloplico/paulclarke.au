import { expect, test } from '@playwright/test';

/**
 * E2E tests for workspace export.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts
 */

test.describe('Workspace Export', () => {
  test('export single workspace opens its printable PDF page', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');
    const card = page.getByRole('link', { name: /^E2E Test Workspace/ });
    await card.getByRole('button').first().click();

    const popupPromise = page.waitForEvent('popup');
    await card.getByRole('button', { name: 'Export' }).click();
    const popup = await popupPromise;

    await expect(popup).toHaveURL(/\/api\/workspaces\/\d+\/export\/pdf$/);
    await expect(popup.getByText('E2E Test Workspace').first()).toBeVisible();
  });

  test('export all workspaces downloads a JSON backup', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export All' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^workspaces-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('export workspace via API returns its sections', async ({ page }) => {
    const workspaces: { id: number; slug: string }[] = await (
      await page.request.get('/api/workspaces')
    ).json();
    const workspace = workspaces.find((w) => w.slug === 'e2e-test-workspace');
    expect(workspace).toBeDefined();

    const exportRes = await page.request.get(`/api/workspaces/${workspace?.id}/export`);

    expect(exportRes.ok()).toBe(true);
    const data = await exportRes.json();
    expect(data.workspaces).toHaveLength(1);
    expect(data.workspaces[0]).toMatchObject({
      title: 'E2E Test Workspace',
      slug: 'e2e-test-workspace',
    });
    expect(data.workspaces[0].sections.map((s: { title: string }) => s.title)).toContain(
      'Project Overview'
    );
  });
});
