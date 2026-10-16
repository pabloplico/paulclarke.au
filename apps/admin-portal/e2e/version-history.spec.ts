import { expect, type Page, test } from '@playwright/test';

/**
 * E2E tests for the version history panel.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts
 *
 * Each test makes its own prose section with two versions, so none depends
 * on another or on seeded history.
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';

/** A section's card, found by its exact title. */
function section(page: Page, title: string) {
  return page
    .locator('main div.rounded-lg.border')
    .filter({ has: page.getByRole('heading', { name: title, level: 3, exact: true }) })
    .last();
}

async function sectionAction(page: Page, title: string, item: string) {
  await section(page, title).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function saveContent(page: Page, title: string, content: string) {
  await sectionAction(page, title, 'Edit');
  await page.getByRole('textbox', { name: 'Write markdown content...' }).fill(content);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(section(page, title).getByText(content)).toBeVisible();
}

/** A new prose section saved twice ("first version", then "second version"), with its history open. */
async function sectionWithHistory(page: Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
  const title = `E2E History ${Date.now()}`;
  await page.locator('main').getByRole('button', { name: 'Add Section' }).click();
  const form = page
    .locator('main div')
    .filter({ has: page.getByRole('heading', { name: 'Add Section', level: 4 }) })
    .filter({ has: page.getByRole('button', { name: 'Cancel' }) })
    .last();
  await form.getByRole('textbox', { name: 'e.g. Project Timeline' }).fill(title);
  await form.getByRole('button', { name: 'Prose', exact: true }).click();
  await form.getByRole('button', { name: 'Add Section', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 3, exact: true })).toBeVisible();

  await saveContent(page, title, 'first version');
  await saveContent(page, title, 'second version');
  await sectionAction(page, title, 'History');
  await expect(page.getByRole('heading', { name: 'Version History' })).toBeVisible();
  return title;
}

const version = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp(`^v${n} `) });

test.describe('Version History', () => {
  test('History opens the version panel', async ({ page }) => {
    const title = await sectionWithHistory(page);

    // Showing the latest version's content alongside
    await expect(section(page, title).getByText('second version')).toBeVisible();
  });

  test('version panel lists every version, newest first', async ({ page }) => {
    await sectionWithHistory(page);

    const versions = page.getByRole('button', { name: /^v\d+ / });
    await expect(versions).toHaveCount(2);
    await expect(versions.nth(0)).toHaveAccessibleName(/^v2 /);
    await expect(versions.nth(1)).toHaveAccessibleName(/^v1 /);
  });

  test('clicking a version shows its changes', async ({ page }) => {
    await sectionWithHistory(page);

    await version(page, 1).click();

    await expect(page.getByRole('heading', { name: 'Changes in v1' })).toBeVisible();
  });

  test('restore appears for an older version, not the latest', async ({ page }) => {
    await sectionWithHistory(page);

    await version(page, 2).click();
    await expect(page.getByRole('heading', { name: 'Changes in v2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore' })).not.toBeVisible();

    await version(page, 1).click();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  });

  test('restoring a version brings its content back as a new version', async ({ page }) => {
    const title = await sectionWithHistory(page);

    await version(page, 1).click();
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(section(page, title).getByText('first version')).toBeVisible();
    await expect(version(page, 3)).toBeVisible();
  });

  test('close version panel with its close button', async ({ page }) => {
    await sectionWithHistory(page);
    const heading = page.getByRole('heading', { name: 'Version History' });

    await heading.locator('..').getByRole('button').click();

    await expect(heading).not.toBeVisible();
  });

  test('version entries show where each version came from', async ({ page }) => {
    await sectionWithHistory(page);

    await expect(version(page, 1)).toContainText('Manual');
    await expect(version(page, 2)).toContainText('Manual');
  });
});
