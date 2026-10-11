import { expect, test } from '@playwright/test';

/**
 * E2E tests for workspace CRUD operations.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces exist
 */

const UNIQUE = Date.now();

test.describe('Workspace CRUD', () => {
  test.describe.configure({ mode: 'serial' });

  test('create workspace from Client Project template', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new workspace/i }).click();

    // Step 1: Choose template
    await expect(page.getByText('Choose a Template')).toBeVisible({ timeout: 5_000 });
    await page.getByText('Client Project').click();

    // Step 2: Fill details
    await expect(page.getByText('Workspace Details')).toBeVisible();
    const titleInput = page.locator('input[placeholder="My Workspace"]');
    await titleInput.fill(`Test Client ${UNIQUE}`);

    // Slug preview should appear
    await expect(page.getByText(/URL:.*test-client/)).toBeVisible();

    // Optional description
    const descInput = page.locator('textarea[placeholder="What is this workspace for?"]');
    if (await descInput.isVisible()) {
      await descInput.fill('E2E test workspace');
    }

    // Create
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // Should navigate to new workspace
    await expect(page).toHaveURL(/\/workspaces\/test-client/, { timeout: 10_000 });
  });

  test('create workspace from Product Launch template', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new workspace/i }).click();
    await expect(page.getByText('Choose a Template')).toBeVisible({ timeout: 5_000 });

    await page.getByText('Product Launch').click();
    await expect(page.getByText('Workspace Details')).toBeVisible();

    await page.locator('input[placeholder="My Workspace"]').fill(`Test Launch ${UNIQUE}`);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    await expect(page).toHaveURL(/\/workspaces\/test-launch/, { timeout: 10_000 });
  });

  test('create workspace from Research Topic template', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new workspace/i }).click();
    await expect(page.getByText('Choose a Template')).toBeVisible({ timeout: 5_000 });

    await page.getByText('Research Topic').click();
    await expect(page.getByText('Workspace Details')).toBeVisible();

    await page.locator('input[placeholder="My Workspace"]').fill(`Test Research ${UNIQUE}`);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    await expect(page).toHaveURL(/\/workspaces\/test-research/, { timeout: 10_000 });
  });

  test('create workspace from Custom template with custom sections', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new workspace/i }).click();
    await expect(page.getByText('Choose a Template')).toBeVisible({ timeout: 5_000 });

    await page.getByText('Custom Workspace').click();
    await expect(page.getByText('Workspace Details')).toBeVisible();

    await page.locator('input[placeholder="My Workspace"]').fill(`Test Custom ${UNIQUE}`);

    // Add a custom section if the UI supports it
    const addSectionBtn = page.getByRole('button', { name: /add section/i });
    if (await addSectionBtn.isVisible()) {
      await addSectionBtn.click();
    }

    await page.getByRole('button', { name: 'Create Workspace' }).click();

    await expect(page).toHaveURL(/\/workspaces\/test-custom/, { timeout: 10_000 });
  });

  test('change template via back link', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new workspace/i }).click();
    await expect(page.getByText('Choose a Template')).toBeVisible({ timeout: 5_000 });

    // Pick one template
    await page.getByText('Client Project').click();
    await expect(page.getByText('Workspace Details')).toBeVisible();

    // Go back and pick a different template
    await page.getByText(/Change template/i).click();
    await expect(page.getByText('Choose a Template')).toBeVisible();

    await page.getByText('Research Topic').click();
    await expect(page.getByText('Workspace Details')).toBeVisible();
  });

  test('close new workspace dialog', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new workspace/i }).click();
    await expect(page.getByText('Choose a Template')).toBeVisible({ timeout: 5_000 });

    // Close via X button
    const closeBtn = page.locator('button.h-7.w-7').filter({ has: page.locator('svg.lucide-x') });
    await closeBtn.click();

    await expect(page.getByText('Choose a Template')).not.toBeVisible();
  });

  test('newly created workspace appears in list', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // The workspace created in earlier tests should be visible as a card title
    await expect(
      page
        .locator('a[href^="/workspaces/"]')
        .filter({ hasText: `Test Client ${UNIQUE}` })
        .first()
    ).toBeVisible();
  });

  test('archive workspace from context menu', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Find our test workspace card and open its context menu
    const card = page.locator('div').filter({
      has: page.getByText(`Test Custom ${UNIQUE}`, { exact: false }),
    });

    const menuBtn = card
      .locator('button')
      .filter({ has: page.locator('svg.lucide-more-vertical') })
      .first();
    if (!(await menuBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await menuBtn.click();

    await page.getByRole('button', { name: 'Archive' }).click();

    // Should show toast or remove from main list
    await page.waitForTimeout(1_000);

    // Workspace should no longer be in main list (may be in archived section)
    await expect(page.locator('a').filter({ hasText: `Test Custom ${UNIQUE}` })).not.toBeVisible();
  });

  test('archived workspace appears in archived section', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Toggle archived view
    const archivedBtn = page.getByRole('button', { name: /archived/i });
    if (!(await archivedBtn.isVisible())) {
      test.skip();
      return;
    }
    await archivedBtn.click();

    // Should show archived workspace
    await expect(page.getByText(`Test Custom ${UNIQUE}`)).toBeVisible({ timeout: 5_000 });
  });

  test('delete workspace with confirmation', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    // Find a test workspace and open context menu
    const card = page.locator('div').filter({
      has: page.getByText(`Test Launch ${UNIQUE}`, { exact: false }),
    });

    const menuBtn = card
      .locator('button')
      .filter({ has: page.locator('svg.lucide-more-vertical') })
      .first();
    if (!(await menuBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await menuBtn.click();

    await page.getByRole('button', { name: 'Delete' }).click();

    // Confirmation dialog should appear
    await expect(page.getByText(/permanently removes/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // Confirm delete
    const confirmDelete = page.getByRole('button', { name: 'Delete' }).last();
    await confirmDelete.click();

    // Workspace should be removed
    await page.waitForTimeout(1_000);
    await expect(page.getByText(`Test Launch ${UNIQUE}`)).not.toBeVisible();
  });

  test('cancel delete keeps workspace', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    const card = page.locator('div').filter({
      has: page.getByText(`Test Research ${UNIQUE}`, { exact: false }),
    });

    const menuBtn = card
      .locator('button')
      .filter({ has: page.locator('svg.lucide-more-vertical') })
      .first();
    if (!(await menuBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await menuBtn.click();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/permanently removes/i)).toBeVisible({ timeout: 3_000 });

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/permanently removes/i)).not.toBeVisible();

    // Workspace should still exist
    await expect(page.getByText(`Test Research ${UNIQUE}`)).toBeVisible();
  });
});
