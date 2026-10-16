import { expect, type Page, test } from '@playwright/test';

/**
 * E2E tests for section management within a workspace.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts (client-project template)
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';

async function goToWorkspace(page: Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
  await expect(
    page.locator('main').getByRole('heading', { name: 'Project Overview', level: 3 })
  ).toBeVisible();
}

/** A section's card, found by its exact title. */
function section(page: Page, title: string) {
  return page
    .locator('main div.rounded-lg.border')
    .filter({ has: page.getByRole('heading', { name: title, level: 3, exact: true }) })
    .last();
}

/** Opens a section's "More actions" menu and picks an item. */
async function sectionAction(page: Page, title: string, item: string) {
  await section(page, title).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** The open "Add Section" form (its submit button shares a name with the one that opens it). */
function addSectionForm(page: Page) {
  return page
    .locator('main div')
    .filter({ has: page.getByRole('heading', { name: 'Add Section', level: 4 }) })
    .filter({ has: page.getByRole('button', { name: 'Cancel' }) })
    .last();
}

async function openAddSectionForm(page: Page) {
  await page.locator('main').getByRole('button', { name: 'Add Section' }).click();
  await expect(page.getByRole('heading', { name: 'Add Section', level: 4 })).toBeVisible();
}

/** Adds a section through the form and waits for it to appear. */
async function addSection(page: Page, title: string, template: string) {
  await openAddSectionForm(page);
  const form = addSectionForm(page);
  await form.getByRole('textbox', { name: 'e.g. Project Timeline' }).fill(title);
  await form.getByRole('button', { name: template, exact: true }).click();
  await form.getByRole('button', { name: 'Add Section', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 3, exact: true })).toBeVisible();
}

test.describe('Section Management', () => {
  test.describe('Add sections', () => {
    for (const template of ['Prose', 'Cards', 'Table', 'Checklist', 'Key-Value']) {
      test(`add ${template.toLowerCase()} section`, async ({ page }) => {
        await goToWorkspace(page);
        await addSection(page, `E2E ${template} ${Date.now()}`, template);
      });
    }

    test('close add section form without creating', async ({ page }) => {
      await goToWorkspace(page);
      await openAddSectionForm(page);

      await addSectionForm(page).getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('heading', { name: 'Add Section', level: 4 })).not.toBeVisible();
    });
  });

  test.describe('Edit sections', () => {
    test('edit prose section content', async ({ page }) => {
      await goToWorkspace(page);
      const appended = `E2E edit test ${Date.now()}`;

      await sectionAction(page, 'Project Overview', 'Edit');
      const textarea = page.getByRole('textbox', { name: 'Write markdown content...' });
      await expect(textarea).toBeVisible();
      await textarea.fill(`${await textarea.inputValue()}\n\n${appended}`);
      await page.getByRole('button', { name: 'Save' }).click();

      // Back to the rendered section, showing the new text
      await expect(textarea).not.toBeVisible();
      await expect(section(page, 'Project Overview').getByText(appended)).toBeVisible();
    });

    test('cancel editing discards changes', async ({ page }) => {
      await goToWorkspace(page);

      await sectionAction(page, 'Meeting Notes', 'Edit');
      const textarea = page.getByRole('textbox', { name: 'Write markdown content...' });
      await textarea.fill('E2E text that should be discarded');
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(textarea).not.toBeVisible();
      await expect(page.getByText('E2E text that should be discarded')).not.toBeVisible();
    });
  });

  test.describe('Delete sections', () => {
    test('delete section asks for confirmation, and No keeps it', async ({ page }) => {
      await goToWorkspace(page);
      const title = `E2E Keep ${Date.now()}`;
      await addSection(page, title, 'Prose');

      await sectionAction(page, title, 'Delete');
      await expect(page.getByText('Delete?')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel delete' }).click();

      await expect(page.getByText('Delete?')).not.toBeVisible();
      await expect(page.getByRole('heading', { name: title, level: 3, exact: true })).toBeVisible();
    });

    test('confirm delete removes section', async ({ page }) => {
      await goToWorkspace(page);
      const title = `E2E Delete ${Date.now()}`;
      await addSection(page, title, 'Prose');

      await sectionAction(page, title, 'Delete');
      await page.getByRole('button', { name: 'Confirm delete' }).click();

      await expect(
        page.getByRole('heading', { name: title, level: 3, exact: true })
      ).not.toBeVisible();
      // Gone after a reload too, not just from the page
      await page.reload();
      await expect(
        page.locator('main').getByRole('heading', { name: 'Project Overview', level: 3 })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: title, level: 3, exact: true })
      ).not.toBeVisible();
    });
  });
});
