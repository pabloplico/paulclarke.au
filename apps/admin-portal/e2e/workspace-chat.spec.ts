import { expect, test } from '@playwright/test';

/**
 * E2E tests for workspace-scoped chat panel.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts
 *
 * The E2E run has no AI provider, so a reply never arrives: the test that
 * waits for one is test.fixme.
 */

const NEEDS_AI =
  'Needs an AI provider to reply; the E2E run has none (no fake provider exists for E2E yet)';

const WORKSPACE_SLUG = 'e2e-test-workspace';

async function goToWorkspace(page: import('@playwright/test').Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Workspace Chat', () => {
  test('chat toggle button is visible on workspace page', async ({ page }) => {
    await goToWorkspace(page);

    // Floating chat button should be visible
    const chatBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-message-square') })
      .last();
    await expect(chatBtn).toBeVisible();
  });

  test('clicking chat button opens chat panel', async ({ page }) => {
    await goToWorkspace(page);

    const chatBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-message-square') })
      .last();
    await chatBtn.click();

    // Chat panel should appear with workspace title and input
    await expect(page.locator('textarea[placeholder="Ask a question..."]')).toBeVisible({
      timeout: 3_000,
    });

    // Empty state message
    await expect(page.getByText('Ask anything about this workspace')).toBeVisible();
  });

  test('send a message and receive response', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page);

    // Open chat
    const chatBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-message-square') })
      .last();
    await chatBtn.click();

    const input = page.locator('textarea[placeholder="Ask a question..."]');
    await expect(input).toBeVisible({ timeout: 3_000 });

    // Type a message
    await input.fill('What is the project overview?');

    // Click send button
    const sendBtn = page.locator('button').filter({ has: page.locator('svg.lucide-send') });
    await sendBtn.click();

    // User message should appear
    await expect(page.getByText('What is the project overview?')).toBeVisible();

    // Loading indicator should appear
    await expect(page.locator('svg.lucide-loader-2')).toBeVisible({ timeout: 3_000 });

    // AI response should appear (wait for AI to respond)
    // Look for any assistant message (the empty state should be gone)
    await expect(page.getByText('Ask anything about this workspace')).not.toBeVisible({
      timeout: 30_000,
    });

    // Should have at least 2 messages (user + assistant)
    const messages = page.locator('[class*="rounded-lg"][class*="border"]').filter({
      has: page.locator('p, div'),
    });
    await expect(messages).toHaveCount(2, { timeout: 30_000 });
  });

  test('clear chat removes messages', async ({ page }) => {
    await goToWorkspace(page);

    // Open chat
    const chatBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-message-square') })
      .last();
    await chatBtn.click();

    const input = page.locator('textarea[placeholder="Ask a question..."]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await page.waitForLoadState('networkidle');

    // Send a message first (unique: the panel reopens the last conversation)
    const message = `Hello ${Date.now()}`;
    await input.fill(message);
    const sendBtn = page.locator('button').filter({ has: page.locator('svg.lucide-send') });
    await sendBtn.click();

    // Wait for user message to appear
    await expect(page.getByText(message)).toBeVisible({ timeout: 5_000 });

    // "New chat" (it was "Clear") starts over with an empty conversation
    await page.getByRole('button', { name: 'New chat' }).click();

    await expect(page.getByText('Ask anything about this workspace')).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Chat panel' }).getByText(message)
    ).not.toBeVisible();
  });

  test('close chat panel via X button', async ({ page }) => {
    await goToWorkspace(page);

    // Open chat
    const chatBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-message-square') })
      .last();
    await chatBtn.click();

    await expect(page.locator('textarea[placeholder="Ask a question..."]')).toBeVisible({
      timeout: 3_000,
    });

    // Close via X button in chat panel header
    const closeBtn = page.locator('button.h-7.w-7').filter({ has: page.locator('svg.lucide-x') });
    await closeBtn.click();

    // Chat input should no longer be visible
    await expect(page.locator('textarea[placeholder="Ask a question..."]')).not.toBeVisible();
  });

  test('send message with Enter key', async ({ page }) => {
    await goToWorkspace(page);

    // Open chat
    const chatBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-message-square') })
      .last();
    await chatBtn.click();

    const input = page.locator('textarea[placeholder="Ask a question..."]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    // The panel reloads the last conversation after opening, which would wipe
    // anything typed first
    await page.waitForLoadState('networkidle');

    const message = `Test enter key ${Date.now()}`;
    await input.fill(message);
    await input.press('Enter');

    await expect(page.getByText(message)).toBeVisible({ timeout: 5_000 });
  });
});
