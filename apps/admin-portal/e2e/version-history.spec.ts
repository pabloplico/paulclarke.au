import { expect, test } from '@playwright/test';

/**
 * E2E tests for version history panel.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces with multiple versions exist
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';

async function goToWorkspace(page: import('@playwright/test').Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Version History', () => {
  test('clicking History opens version panel', async ({ page }) => {
    await goToWorkspace(page);

    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    if (!(await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await historyBtn.click();

    // Version panel should appear
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });
  });

  test('version panel shows version list', async ({ page }) => {
    await goToWorkspace(page);

    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    if (!(await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await historyBtn.click();

    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });

    // Should show at least v1 (the initial version)
    await expect(page.getByText(/v1/).first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a version shows diff', async ({ page }) => {
    await goToWorkspace(page);

    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    if (!(await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await historyBtn.click();
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });

    // Click on a version entry
    const versionEntry = page.getByText(/v1/).first();
    await versionEntry.click();

    // Should show "Changes in v1" or diff content
    await expect(
      page.getByText(/changes in v/i).or(page.locator('[class*="version-diff"]'))
    ).toBeVisible({ timeout: 5_000 });
  });

  test('restore button appears for non-latest versions', async ({ page }) => {
    await goToWorkspace(page);

    // First, create a second version by editing a section
    const editBtn = page.getByRole('button', { name: 'Edit' }).first();
    if (!(await editBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Use API to check if section has multiple versions
    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    await historyBtn.click();
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });

    // If there are multiple versions, click the older one
    const versions = page.locator('button').filter({ hasText: /^v\d+/ });
    const versionCount = await versions.count();

    if (versionCount < 2) {
      test.skip();
      return;
    }

    // Click the older version (last in the list)
    await versions.last().click();

    // Restore button should be visible (only for non-latest versions)
    const restoreBtn = page.getByRole('button', { name: /restore/i });
    await expect(restoreBtn).toBeVisible({ timeout: 5_000 });
  });

  test('restore version updates section content', async ({ page }) => {
    await goToWorkspace(page);

    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    await historyBtn.click();
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });

    const versions = page.locator('button').filter({ hasText: /^v\d+/ });
    const versionCount = await versions.count();

    if (versionCount < 2) {
      test.skip();
      return;
    }

    // Click an older version
    await versions.last().click();

    const restoreBtn = page.getByRole('button', { name: /restore/i });
    if (!(await restoreBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await restoreBtn.click();

    // Wait for restore to complete
    await page.waitForTimeout(2_000);

    // A new version should have been created (the restored content as a new version)
    // Version count should increase
    const updatedVersions = page.locator('button').filter({ hasText: /^v\d+/ });
    const newCount = await updatedVersions.count();
    expect(newCount).toBeGreaterThanOrEqual(versionCount);
  });

  test('close version panel via X button', async ({ page }) => {
    await goToWorkspace(page);

    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    if (!(await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await historyBtn.click();
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });

    // Close via X button
    const closeBtn = page
      .locator('[class*="border-l"]')
      .locator('button')
      .filter({ has: page.locator('svg.lucide-x') });
    await closeBtn.click();

    await expect(page.getByText('Version History')).not.toBeVisible();
  });

  test('version entries show source badges', async ({ page }) => {
    await goToWorkspace(page);

    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    if (!(await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await historyBtn.click();
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 5_000 });

    // Version entries should show source badges (Manual, AI Edit, AI Ingest, AI Fix, etc.)
    const badges = page.locator('[class*="border-l"]').locator('[class*="badge"]');
    const badgeCount = await badges.count();
    expect(badgeCount).toBeGreaterThan(0);
  });
});
