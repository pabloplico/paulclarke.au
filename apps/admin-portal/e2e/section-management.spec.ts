import { expect, test } from '@playwright/test';

/**
 * E2E tests for section management within a workspace.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3003
 *  - Seeded workspaces exist
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';

async function goToWorkspace(page: import('@playwright/test').Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
  // Wait for sections to render
  await page.waitForTimeout(1_000);
}

async function openAddSectionDialog(page: import('@playwright/test').Page) {
  // The "Add Section" button is the dashed-border button at the bottom
  const addBtn = page.locator('button.border-dashed', { hasText: 'Add Section' });
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  // Wait for the dialog heading
  await expect(page.getByRole('heading', { name: 'Add Section' })).toBeVisible({ timeout: 5_000 });
}

test.describe('Section Management', () => {
  test.describe('Add sections', () => {
    test('add prose section via dialog', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionDialog(page);

      const sectionTitle = `E2E Prose ${Date.now()}`;

      // Fill title
      await page.locator('input[placeholder="e.g. Project Timeline"]').fill(sectionTitle);

      // Select prose template (should be default)
      const proseBtn = page.getByRole('button', { name: /prose/i });
      if (await proseBtn.isVisible()) {
        await proseBtn.click();
      }

      // Submit via the dialog's Add Section button
      const dialog = page.locator('.fixed.inset-0');
      await dialog.getByRole('button', { name: 'Add Section' }).click();

      // New section should appear on the page
      await expect(page.getByRole('heading', { name: sectionTitle })).toBeVisible({
        timeout: 10_000,
      });
    });

    test('add cards section', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionDialog(page);

      const title = `E2E Cards ${Date.now()}`;
      await page.locator('input[placeholder="e.g. Project Timeline"]').fill(title);
      await page.getByRole('button', { name: /cards/i }).click();

      const dialog = page.locator('.fixed.inset-0');
      await dialog.getByRole('button', { name: 'Add Section' }).click();

      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
    });

    test('add table section', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionDialog(page);

      const title = `E2E Table ${Date.now()}`;
      await page.locator('input[placeholder="e.g. Project Timeline"]').fill(title);
      await page.getByRole('button', { name: /table/i }).click();

      const dialog = page.locator('.fixed.inset-0');
      await dialog.getByRole('button', { name: 'Add Section' }).click();

      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
    });

    test('add checklist section', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionDialog(page);

      const title = `E2E Checklist ${Date.now()}`;
      await page.locator('input[placeholder="e.g. Project Timeline"]').fill(title);
      await page.getByRole('button', { name: /checklist/i }).click();

      const dialog = page.locator('.fixed.inset-0');
      await dialog.getByRole('button', { name: 'Add Section' }).click();

      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
    });

    test('add key-value section', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionDialog(page);

      const title = `E2E KV ${Date.now()}`;
      await page.locator('input[placeholder="e.g. Project Timeline"]').fill(title);
      await page.getByRole('button', { name: /key.?value/i }).click();

      const dialog = page.locator('.fixed.inset-0');
      await dialog.getByRole('button', { name: 'Add Section' }).click();

      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
    });

    test('close add section dialog without creating', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionDialog(page);

      // Close via Cancel button
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('heading', { name: 'Add Section' })).not.toBeVisible();
    });
  });

  test.describe('Edit sections', () => {
    test('edit prose section content', async ({ page }) => {
      await goToWorkspace(page);

      // Use a seeded prose section from the client-project template
      const sectionHeading = page.getByRole('heading', { name: 'Project Overview' });
      if (!(await sectionHeading.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip();
        return;
      }

      // Click Edit button near the section heading
      const section = sectionHeading.locator('..').locator('..');
      const editBtn = section.getByRole('button', { name: 'Edit' });
      await editBtn.click();

      // Should show textarea
      const textarea = page.locator('textarea[placeholder="Write markdown content..."]').last();
      await expect(textarea).toBeVisible({ timeout: 3_000 });

      // Get current content, append to it
      const current = await textarea.inputValue();
      await textarea.fill(`${current}\n\nE2E edit test appended.`);

      // Save — button is near the textarea
      const saveBtn = page.getByRole('button', { name: 'Save' }).last();
      await saveBtn.click();

      // Wait for save to complete
      await page.waitForTimeout(1_500);

      // Should exit edit mode and show rendered content
      await expect(page.getByText('E2E edit test appended').first()).toBeVisible();
    });

    test('cancel editing discards changes', async ({ page }) => {
      await goToWorkspace(page);

      // Use a seeded section
      const sectionHeading = page.getByRole('heading', { name: 'Meeting Notes' });
      if (!(await sectionHeading.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip();
        return;
      }

      const section = sectionHeading.locator('..').locator('..');
      const editBtn = section.getByRole('button', { name: 'Edit' });
      await editBtn.click();

      // Should show textarea
      const textarea = page.locator('textarea[placeholder="Write markdown content..."]').last();
      await expect(textarea).toBeVisible({ timeout: 3_000 });

      // Cancel
      const cancelBtn = section.getByRole('button', { name: 'Cancel' });
      await cancelBtn.click();

      // Should exit edit mode
      await expect(textarea).not.toBeVisible();
    });
  });

  test.describe('Delete sections', () => {
    test('delete section requires double confirmation', async ({ page }) => {
      await goToWorkspace(page);

      // Find any E2E-created section to test deletion
      const sectionHeading = page.getByRole('heading', { name: /^E2E / }).last();
      if (!(await sectionHeading.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip();
        return;
      }

      const sectionTitle = await sectionHeading.textContent();
      const section = sectionHeading.locator('..').locator('..');

      // First click on trash icon — the button has aria-label "Delete section"
      const deleteBtn = section.getByRole('button', { name: /delete section/i });
      await deleteBtn.click();

      // Should show "Delete?" confirmation with Yes/No
      await expect(section.getByText('Delete?')).toBeVisible();
      await expect(section.getByRole('button', { name: 'Yes' })).toBeVisible();
      await expect(section.getByRole('button', { name: 'No' })).toBeVisible();

      // Click No to cancel
      await section.getByRole('button', { name: 'No' }).click();
      await expect(section.getByText('Delete?')).not.toBeVisible();

      // Section should still be there
      await expect(sectionHeading).toBeVisible();
    });

    test('confirm delete removes section', async ({ page }) => {
      await goToWorkspace(page);

      // Find any E2E-created section to delete
      const lastHeading = page.getByRole('heading', { name: /^E2E / }).last();
      if (!(await lastHeading.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip();
        return;
      }

      // Capture exact title so we can check it's gone after deletion
      const title = await lastHeading.textContent();
      const exactHeading = page.getByRole('heading', { name: title!, exact: true });
      const section = exactHeading.locator('..').locator('..');

      // First click on trash icon
      const deleteBtn = section.getByRole('button', { name: /delete section/i });
      await deleteBtn.click();

      // Confirm with Yes
      await section.getByRole('button', { name: 'Yes' }).click();

      // Section should be removed
      await expect(exactHeading).not.toBeVisible({ timeout: 5_000 });
    });
  });
});
