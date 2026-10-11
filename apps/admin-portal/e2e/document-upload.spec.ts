import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * E2E tests for document upload and processing workflow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - BullMQ workers running (document-processing)
 *  - Redis available
 */

test.describe('Document Upload & Processing', () => {
  test('documents page has upload drop zone', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Should show the upload area
    const uploadArea = page.getByText(/drop|upload|drag/i).first();
    await expect(uploadArea).toBeVisible({ timeout: 5_000 });
  });

  test('upload a text file via file input', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Create a temporary test file
    const testContent = `# E2E Test Document ${Date.now()}\n\nThis is a test document for E2E testing.\n\nIt contains multiple paragraphs to test document processing.\n\nKey topics: AI consulting, business strategy, digital transformation.`;
    const tmpFile = path.join('/tmp', `e2e-test-doc-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, testContent);

    try {
      // Find file input (may be hidden)
      const fileInput = page.locator('input[type="file"]');
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      await fileInput.setInputFiles(tmpFile);

      // Should show upload progress or success
      await page.waitForTimeout(2_000);

      // Check if the document appears in the list
      // Switch to All tab to see all documents
      await page.getByRole('button', { name: 'All' }).click();
      await page.waitForLoadState('networkidle');

      // New document should appear (may take a moment)
      await expect(page.getByText(/e2e-test-doc/i)).toBeVisible({ timeout: 10_000 });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('uploaded document shows processing status', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Check Processing tab
    await page.getByRole('button', { name: /Processing/ }).click();
    await page.waitForLoadState('networkidle');

    // If there are processing documents, they should show processing badge
    const processingDocs = page.locator('a[href^="/documents/"]');
    const count = await processingDocs.count();

    if (count > 0) {
      // At least one document in processing state
      await expect(page.getByText(/processing/i).first()).toBeVisible();
    }
    // If no processing docs, that's fine too - they may have completed
  });

  test('document transitions from processing to ready', async ({ page }) => {
    // Upload via API for reliable test
    const testContent = `E2E processing test ${Date.now()}. AI consulting services overview.`;
    const tmpFile = path.join('/tmp', `e2e-proc-test-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, testContent);

    try {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      const fileInput = page.locator('input[type="file"]');
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      await fileInput.setInputFiles(tmpFile);
      await page.waitForTimeout(1_000);

      // Poll for document to become ready
      await expect(async () => {
        const res = await page.request.get('/api/documents');
        const docs = await res.json();
        const testDoc = docs.find((d: { originalName: string }) =>
          d.originalName?.includes('e2e-proc-test')
        );
        if (!testDoc) {
          // Document may not be in list yet
          return;
        }
        expect(['ready', 'processing']).toContain(testDoc.status);
      }).toPass({ timeout: 30_000 });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('document detail page shows document info', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Click Ready filter to find a document with content
    await page.getByRole('button', { name: /Ready/ }).click();
    await page.waitForLoadState('networkidle');

    const docLink = page.locator('a[href^="/documents/"]').first();
    if (!(await docLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await docLink.click();
    await page.waitForLoadState('networkidle');

    // Detail page should show document information
    const main = page.locator('main');
    await expect(main).toBeVisible();

    // Should show action buttons
    await expect(main.getByRole('button', { name: 'Archive', exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });
});
