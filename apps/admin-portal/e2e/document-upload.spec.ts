import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * E2E tests for document upload and processing workflow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The in-process document-processing worker (it starts with the server)
 */

const NEEDS_AI =
  'Needs a Ready document: processing calls the embedding model, and the E2E run has no AI provider (no fake provider exists for E2E yet)';

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
      // The Upload button opens the panel with the (hidden) file input
      await page.getByRole('button', { name: 'Upload' }).click();
      const uploaded = page.waitForResponse(
        (res) => res.url().endsWith('/api/documents') && res.request().method() === 'POST'
      );
      await page.locator('input[type="file"]').setInputFiles(tmpFile);
      // The panel's own Upload (submit) button
      await page.locator('form').getByRole('button', { name: 'Upload' }).click();
      expect((await uploaded).status()).toBe(202);

      await page.getByRole('button', { name: 'All', exact: true }).click();
      await expect(page.getByText(path.basename(tmpFile)).first()).toBeVisible();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('uploaded document shows processing status', async ({ page }) => {
    // A document of its own, still working through its stages (it retries for
    // a while before failing without an AI provider)
    const name = `e2e-processing-${Date.now()}.md`;
    const res = await page.request.post('/api/documents', {
      multipart: {
        file: { name, mimeType: 'text/markdown', buffer: Buffer.from('# Stage\n\nText.') },
      },
    });
    const { id } = await res.json();

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Processing/ }).click();

    // Listed under Processing, labelled with its current stage
    const link = page.locator(`a[href="/documents/${id}"]`);
    await expect(link).toBeVisible();
    await expect(link).toContainText(
      /Uploaded|Extracting|Cleaning|Chunking|Embedding|Analy[sz]ing/
    );
  });

  test('document transitions from processing to ready', async ({ page }) => {
    test.fixme(true, NEEDS_AI);
    // Upload via API for reliable test
    const testContent = `E2E processing test ${Date.now()}. AI consulting services overview.`;
    const tmpFile = path.join('/tmp', `e2e-proc-test-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, testContent);

    try {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Upload' }).click();
      const uploaded = page.waitForResponse(
        (res) => res.url().endsWith('/api/documents') && res.request().method() === 'POST'
      );
      await page.locator('input[type="file"]').setInputFiles(tmpFile);
      // The panel's own Upload (submit) button
      await page.locator('form').getByRole('button', { name: 'Upload' }).click();
      await uploaded;

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
    // Its own document; any status has a detail page
    const name = `e2e-detail-${Date.now()}.md`;
    const res = await page.request.post('/api/documents', {
      multipart: {
        file: { name, mimeType: 'text/markdown', buffer: Buffer.from('# Detail\n\nText.') },
      },
    });
    const { id } = await res.json();

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
    await page.locator(`a[href="/documents/${id}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/documents/${id}$`));
    const main = page.locator('main');
    await expect(main.getByText(name).first()).toBeVisible();

    // Should show action buttons
    await expect(main.getByRole('button', { name: 'Archive', exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });
});
