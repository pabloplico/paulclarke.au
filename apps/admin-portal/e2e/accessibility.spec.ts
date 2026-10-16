import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Every button and link has an accessible name: axe's button-name and
 * link-name rules, on the main pages and the states that reveal more
 * controls (menus, dialogs, panels). Not a full WCAG audit.
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';

/** Fails with each unnamed button or link, by rule and selector. */
async function expectEveryControlNamed(page: Page) {
  const results = await new AxeBuilder({ page }).withRules(['button-name', 'link-name']).analyze();
  expect(
    results.violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.html.slice(0, 120)}`)
    )
  ).toEqual([]);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** A section's card, found by its exact title. */
function section(page: Page, title: string) {
  return page
    .locator('main div.rounded-lg.border')
    .filter({ has: page.getByRole('heading', { name: title, level: 3, exact: true }) })
    .last();
}

test.describe('Accessible names', () => {
  test('workspaces list, with a workspace card menu open', async ({ page }) => {
    await open(page, '/workspaces');
    await expect(page.getByRole('link', { name: /^E2E Test Workspace/ })).toBeVisible();
    await expectEveryControlNamed(page);

    await page
      .getByRole('link', { name: /^E2E Test Workspace/ })
      .getByRole('button')
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expectEveryControlNamed(page);
  });

  test('New Workspace dialog', async ({ page }) => {
    await open(page, '/workspaces');
    await page.getByRole('button', { name: 'New Workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a Template' })).toBeVisible();
    await expectEveryControlNamed(page);

    await page.getByRole('button', { name: /^Custom Workspace/ }).click();
    await expect(page.getByText('Workspace Details')).toBeVisible();
    await expectEveryControlNamed(page);
  });

  test('workspace page, with a section menu and the version panel open', async ({ page }) => {
    await open(page, `/workspaces/${WORKSPACE_SLUG}`);
    await expect(section(page, 'Project Overview')).toBeVisible();
    await expectEveryControlNamed(page);

    await section(page, 'Project Overview').getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'History' })).toBeVisible();
    await expectEveryControlNamed(page);

    await page.getByRole('menuitem', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Version History' })).toBeVisible();
    await expectEveryControlNamed(page);
  });

  test('chat panel', async ({ page }) => {
    await open(page, `/workspaces/${WORKSPACE_SLUG}`);
    await page.getByRole('button', { name: 'Open chat' }).click();
    await expect(page.getByRole('dialog', { name: 'Chat panel' })).toBeVisible();
    await expectEveryControlNamed(page);
  });

  test('inbox with an item', async ({ page }) => {
    await open(page, '/inbox');
    const title = `E2E a11y note ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Note title' }).fill(title);
    await page
      .getByRole('textbox', { name: 'Paste or type your notes here...' })
      .fill('Some text.');
    await page.getByRole('button', { name: 'Add Note' }).click();
    await expect(page.getByRole('heading', { name: title, level: 4 })).toBeVisible();
    await expectEveryControlNamed(page);
  });

  test('documents, with a document row menu open', async ({ page }) => {
    const name = `e2e-a11y-${Date.now()}.md`;
    const res = await page.request.post('/api/documents', {
      multipart: {
        file: { name, mimeType: 'text/markdown', buffer: Buffer.from('# A11y\n\nText.') },
      },
    });
    expect(res.status()).toBe(202);

    await open(page, '/documents');
    const row = page.locator('a[href^="/documents/"]').filter({ hasText: name }).locator('..');
    await expect(row).toBeVisible();
    await expectEveryControlNamed(page);

    await row.getByRole('button').first().click();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expectEveryControlNamed(page);
  });

  test('knowledge base list and detail', async ({ page }) => {
    const name = `E2E a11y KB ${Date.now()}`;
    await open(page, '/knowledge-base');
    await page.getByRole('button', { name: 'New Knowledge Base' }).click();
    await page.getByRole('textbox', { name: 'Knowledge base name' }).fill(name);
    await expectEveryControlNamed(page);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name, level: 3, exact: true })).toBeVisible();
    await expectEveryControlNamed(page);

    await page.getByRole('heading', { name, level: 3, exact: true }).click();
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
    await expectEveryControlNamed(page);
  });
});
