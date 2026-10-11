import { expect, test } from '@playwright/test';

// Helper: get the list of document row cards (each has a link to /documents/<id>)
function docRows(page: import('@playwright/test').Page) {
  return page
    .locator('a[href^="/documents/"]')
    .locator('xpath=ancestor::div[contains(@class,"flex w-full")]/..');
}

// Helper: open three-dot dropdown on a doc row by index
async function openDropdown(page: import('@playwright/test').Page, index = 0) {
  const row = docRows(page).nth(index);
  await expect(row).toBeVisible({ timeout: 10_000 });
  const menuBtn = row.locator('.relative > button').first();
  await menuBtn.click();
}

// Helper: navigate to list with Ready filter applied
async function gotoReadyDocs(page: import('@playwright/test').Page) {
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Ready/ }).click();
  await page.waitForLoadState('networkidle');
}

// Helper: navigate to a ready document's detail page
async function gotoReadyDocDetail(page: import('@playwright/test').Page) {
  await gotoReadyDocs(page);
  const firstDocLink = docRows(page).first().locator('a[href^="/documents/"]').first();
  await expect(firstDocLink).toBeVisible({ timeout: 10_000 });
  await firstDocLink.click();
  await page.waitForLoadState('networkidle');
}

test.describe('Document Actions', () => {
  test.describe.configure({ mode: 'serial' });

  test('documents page loads with filter tabs', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Documents', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Processing/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ready/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Error/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archived/ })).toBeVisible();
  });

  test('three-dot dropdown shows all actions for ready document', async ({ page }) => {
    await gotoReadyDocs(page);

    const count = await docRows(page).count();
    if (count === 0) {
      test.skip();
      return;
    }

    await openDropdown(page, 0);

    // Ready documents show all actions
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reprocess', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-clean text', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI clean-up', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();

    // Close dropdown by clicking elsewhere
    await page.locator('body').click({ position: { x: 10, y: 10 } });
  });

  test('archive document from list view', async ({ page }) => {
    await gotoReadyDocs(page);

    // Count documents before
    const readyBtn = page.getByRole('button', { name: /Ready \d+/ });
    const readyText = await readyBtn.textContent();
    const initialCount = parseInt(readyText?.match(/\d+/)?.[0] ?? '0', 10);

    await openDropdown(page, 0);

    // Click Archive
    await page.getByRole('button', { name: 'Archive', exact: true }).click();

    // Toast should appear
    await expect(page.getByText('Document archived')).toBeVisible({ timeout: 5_000 });

    // Ready count should decrease
    await expect(page.getByRole('button', { name: /Ready/ })).toContainText(`${initialCount - 1}`);
  });

  test('archived document appears in Archived tab with badge', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Switch to Archived tab
    await page.getByRole('button', { name: /Archived/ }).click();
    await page.waitForLoadState('networkidle');

    // At least one archived doc should exist (from previous test)
    const firstRow = docRows(page).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Should show "Archived" badge
    await expect(firstRow.getByText('Archived')).toBeVisible();
  });

  test('unarchive document from Archived tab', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Switch to Archived tab
    await page.getByRole('button', { name: /Archived/ }).click();
    await page.waitForLoadState('networkidle');

    await openDropdown(page, 0);

    // Should show "Unarchive" instead of "Archive"
    await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible();
    await page.getByRole('button', { name: 'Unarchive' }).click();

    // Toast should appear
    await expect(page.getByText('Document unarchived')).toBeVisible({ timeout: 5_000 });
  });

  test('re-clean document from list dropdown', async ({ page }) => {
    await gotoReadyDocs(page);

    await openDropdown(page, 0);

    // Click Re-clean text
    await page.getByRole('button', { name: 'Re-clean text' }).click();

    // Toast should appear
    await expect(page.getByText('Text re-cleaned')).toBeVisible({ timeout: 10_000 });
  });

  test('delete document shows confirmation and can cancel', async ({ page }) => {
    await gotoReadyDocs(page);

    await openDropdown(page, 0);

    // Click Delete
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Confirmation dialog should appear
    await expect(page.getByRole('heading', { name: 'Delete Document' })).toBeVisible();
    await expect(page.getByText(/Permanently delete/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // Cancel — do not actually delete
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Dialog should close
    await expect(page.getByRole('heading', { name: 'Delete Document' })).not.toBeVisible();
  });

  test('detail page shows all action buttons for ready doc', async ({ page }) => {
    await gotoReadyDocDetail(page);

    // Detail page should show all action buttons
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Reprocess' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Re-clean' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'AI Clean-up' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('archive and unarchive from detail page', async ({ page }) => {
    await gotoReadyDocDetail(page);

    const main = page.locator('main');

    // Archive
    await main.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Document archived')).toBeVisible({ timeout: 10_000 });

    // Should now show "Unarchive" button after page refreshes
    await expect(main.getByRole('button', { name: 'Unarchive' })).toBeVisible({
      timeout: 10_000,
    });

    // Unarchive
    await main.getByRole('button', { name: 'Unarchive' }).click();
    await expect(page.getByText('Document unarchived')).toBeVisible({ timeout: 10_000 });

    // Should revert to "Archive" button
    await expect(main.getByRole('button', { name: 'Archive', exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('re-clean from detail page', async ({ page }) => {
    await gotoReadyDocDetail(page);

    // Click Re-clean
    await page.getByRole('button', { name: 'Re-clean' }).click();
    await expect(page.getByText('Text re-cleaned')).toBeVisible({ timeout: 10_000 });
  });

  test('reprocess from detail page', async ({ page }) => {
    await gotoReadyDocDetail(page);

    // Click Reprocess
    await page.getByRole('button', { name: 'Reprocess' }).click();
    await expect(page.getByText('Document re-queued for processing')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('delete from detail page with confirmation', async ({ page }) => {
    await gotoReadyDocs(page);

    // Count initial docs
    const initialCount = await docRows(page).count();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Navigate to last document detail (least impactful to delete)
    const lastDocLink = docRows(page).last().locator('a[href^="/documents/"]').first();
    await lastDocLink.click();
    await page.waitForLoadState('networkidle');

    // Click Delete
    await page.getByRole('button', { name: 'Delete' }).click();

    // Confirmation dialog
    await expect(page.getByRole('heading', { name: 'Delete Document' })).toBeVisible();
    await expect(page.getByText(/Permanently delete/)).toBeVisible();

    // Confirm delete — the dialog has its own Delete button
    const confirmBtn = page.locator('button', { hasText: 'Delete' }).last();
    await confirmBtn.click();

    // Should show success toast and redirect to documents list
    await expect(page.getByText('Document deleted')).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL('/documents', { timeout: 5_000 });
  });
});
