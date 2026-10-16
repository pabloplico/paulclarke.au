import { expect, type Page, test } from '@playwright/test';

/**
 * E2E tests for workspace CRUD operations.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *
 * Serial: the first tests create the workspaces the later ones archive and
 * delete.
 */

const UNIQUE = Date.now();

/** A workspace card on the list, by the start of its title. */
const card = (page: Page, title: string) =>
  page.getByRole('link', { name: new RegExp(`^${title}`) });

/** Opens a workspace card's menu and picks an action. */
async function cardAction(page: Page, title: string, action: string) {
  const target = card(page, title);
  await target.getByRole('button').first().click();
  await target.getByRole('button', { name: action, exact: true }).click();
}

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
    const heading = page.getByRole('heading', { name: 'Choose a Template' });
    await expect(heading).toBeVisible();

    // The unlabelled X button beside the heading
    await heading.locator('..').getByRole('button').click();

    await expect(heading).not.toBeVisible();
  });

  test('newly created workspace appears in list', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await expect(card(page, `Test Client ${UNIQUE}`)).toBeVisible();
  });

  test('archive workspace from context menu', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await cardAction(page, `Test Custom ${UNIQUE}`, 'Archive');

    // Off the main list (archived workspaces are hidden until shown)
    await expect(card(page, `Test Custom ${UNIQUE}`)).not.toBeVisible();
  });

  test('archived workspace appears in archived section', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^Archived \(\d+\)$/ }).click();

    // Archived cards aren't links: find the card by its title
    const archived = page
      .locator('main div.rounded-lg')
      .filter({ has: page.getByText(`Test Custom ${UNIQUE}`, { exact: true }) })
      .last();
    await expect(archived).toBeVisible();
    await expect(archived).toContainText('Archived');
  });

  test('delete workspace with confirmation', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await cardAction(page, `Test Launch ${UNIQUE}`, 'Delete');
    await expect(page.getByText(/permanently removes/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // The dialog's own Delete button
    await page.getByRole('button', { name: 'Delete' }).last().click();

    await expect(page.getByText(/permanently removes/i)).not.toBeVisible();
    await expect(card(page, `Test Launch ${UNIQUE}`)).not.toBeVisible();
    await page.reload();
    await expect(card(page, `Test Client ${UNIQUE}`)).toBeVisible();
    await expect(card(page, `Test Launch ${UNIQUE}`)).not.toBeVisible();
  });

  test('cancel delete keeps workspace', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await cardAction(page, `Test Research ${UNIQUE}`, 'Delete');
    await expect(page.getByText(/permanently removes/i)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByText(/permanently removes/i)).not.toBeVisible();
    await expect(card(page, `Test Research ${UNIQUE}`)).toBeVisible();
  });
});
