import { expect, type Page, test } from '@playwright/test';

/**
 * E2E tests for document actions in the list and on the detail page.
 *
 * Each test uploads its own document. The E2E run has no AI provider, so
 * processing fails at the embedding step and the document ends up in Error,
 * never Ready: actions only offered for Ready documents are test.fixme.
 */

const NEEDS_AI =
  'Needs a Ready document: processing calls the embedding model, and the E2E run has no AI provider (no fake provider exists for E2E yet)';

/** Uploads a small Markdown document through the API and returns it. */
async function uploadDocument(page: Page, status?: 'error') {
  const name = `e2e-doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.md`;
  const res = await page.request.post('/api/documents', {
    multipart: {
      file: { name, mimeType: 'text/markdown', buffer: Buffer.from(`# ${name}\n\nE2E text.`) },
    },
  });
  expect(res.status()).toBe(202);
  const doc: { id: number } = await res.json();
  if (status) {
    // Processing retries, then gives up without an AI provider
    await expect
      .poll(
        async () => (await (await page.request.get(`/api/documents/${doc.id}`)).json()).status,
        {
          timeout: 45_000,
        }
      )
      .toBe(status);
  }
  return { id: doc.id, name };
}

/** The document's row in the list: its link plus the row's menu button. */
function row(page: Page, name: string) {
  return page.locator('a[href^="/documents/"]').filter({ hasText: name }).locator('..');
}

async function rowAction(page: Page, name: string, action: string) {
  await row(page, name)
    .getByRole('button', { name: /^Actions for / })
    .click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

/** Opens the menu of the first document listed. */
async function openFirstRowMenu(page: Page) {
  const first = page.locator('a[href^="/documents/"]').first();
  await expect(first).toBeVisible();
  await first
    .locator('..')
    .getByRole('button', { name: /^Actions for / })
    .click();
}

/** The detail page of the first Ready document. */
async function gotoReadyDocDetail(page: Page) {
  await gotoDocuments(page, 'Ready');
  await page.locator('a[href^="/documents/"]').first().click();
  await expect(page).toHaveURL(/\/documents\/\d+$/);
}

async function gotoDocuments(page: Page, tab = 'All') {
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
}

test.describe('Document Actions', () => {
  test('documents page loads with filter tabs', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    for (const tab of ['Processing', 'Ready', 'Error', 'Archived']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${tab} \\d+$`) })).toBeVisible();
    }
  });

  test('three-dot dropdown shows all actions for ready document', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await gotoDocuments(page, 'Ready');

    await openFirstRowMenu(page);

    for (const action of ['Archive', 'Reprocess', 'Re-clean text', 'AI clean-up', 'Delete']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible();
    }
  });

  test('archive document from list view', async ({ page }) => {
    const { name } = await uploadDocument(page);
    await gotoDocuments(page);

    await rowAction(page, name, 'Archive');

    await expect(page.getByText('Document archived')).toBeVisible();
    await page.getByRole('button', { name: /^Archived/ }).click();
    await expect(row(page, name)).toBeVisible();
  });

  test('archived document appears in Archived tab with badge', async ({ page }) => {
    const { id, name } = await uploadDocument(page);
    expect(
      (await page.request.patch(`/api/documents/${id}`, { data: { archived: true } })).ok()
    ).toBe(true);

    await gotoDocuments(page, 'Archived');

    await expect(row(page, name)).toBeVisible();
    await expect(row(page, name).getByText('Archived')).toBeVisible();
  });

  test('unarchive document from Archived tab', async ({ page }) => {
    const { id, name } = await uploadDocument(page);
    await page.request.patch(`/api/documents/${id}`, { data: { archived: true } });
    await gotoDocuments(page, 'Archived');

    await rowAction(page, name, 'Unarchive');

    await expect(page.getByText('Document unarchived')).toBeVisible();
    await expect(row(page, name)).not.toBeVisible();
  });

  test('re-clean document from list dropdown', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await gotoDocuments(page, 'Ready');
    await openFirstRowMenu(page);

    await page.getByRole('button', { name: 'Re-clean text' }).click();

    await expect(page.getByText('Text re-cleaned')).toBeVisible({ timeout: 10_000 });
  });

  test('delete document shows confirmation and can cancel', async ({ page }) => {
    const { name } = await uploadDocument(page);
    await gotoDocuments(page);

    await rowAction(page, name, 'Delete');

    await expect(page.getByRole('heading', { name: 'Delete Document' })).toBeVisible();
    await expect(page.getByText(/Permanently delete/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Delete Document' })).not.toBeVisible();
    await expect(row(page, name)).toBeVisible();
  });

  test('detail page shows all action buttons for ready doc', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await gotoReadyDocDetail(page);

    const main = page.locator('main');
    await expect(main.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Reprocess' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Re-clean' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'AI Clean-up' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('archive and unarchive from detail page', async ({ page }) => {
    const { id } = await uploadDocument(page);
    await page.goto(`/documents/${id}`);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');

    await main.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Document archived')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Unarchive' })).toBeVisible();

    await main.getByRole('button', { name: 'Unarchive' }).click();
    await expect(page.getByText('Document unarchived')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
  });

  test('re-clean from detail page', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await gotoReadyDocDetail(page);

    await page.getByRole('button', { name: 'Re-clean' }).click();

    await expect(page.getByText('Text re-cleaned')).toBeVisible({ timeout: 10_000 });
  });

  test('reprocess from detail page', async ({ page }) => {
    // Reprocess is offered once processing has stopped (here: failed)
    const { id } = await uploadDocument(page, 'error');
    await page.goto(`/documents/${id}`);
    await page.waitForLoadState('networkidle');

    await page.locator('main').getByRole('button', { name: 'Reprocess' }).click();

    await expect(page.getByText('Document re-queued for processing')).toBeVisible();
  });

  test('delete from detail page with confirmation', async ({ page }) => {
    const { id } = await uploadDocument(page);
    await page.goto(`/documents/${id}`);
    await page.waitForLoadState('networkidle');

    await page.locator('main').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'Delete Document' })).toBeVisible();
    await expect(page.getByText(/Permanently delete/)).toBeVisible();
    // The dialog's own Delete button
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();

    await expect(page.getByText('Document deleted')).toBeVisible();
    await expect(page).toHaveURL(/\/documents$/);
    expect((await page.request.get(`/api/documents/${id}`)).status()).toBe(404);
  });
});
