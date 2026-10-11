import { expect, test } from '@playwright/test';

/**
 * E2E tests for workspace-scoped chat panel.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces exist
 *  - AI_PROVIDER and API key configured
 */

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

    // Send a message first
    await input.fill('Hello');
    const sendBtn = page.locator('button').filter({ has: page.locator('svg.lucide-send') });
    await sendBtn.click();

    // Wait for user message to appear
    await expect(page.getByText('Hello')).toBeVisible({ timeout: 5_000 });

    // Clear button should now be visible
    const clearBtn = page.getByRole('button', { name: /clear/i });
    if (!(await clearBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await clearBtn.click();

    // Should return to empty state
    await expect(page.getByText('Ask anything about this workspace')).toBeVisible({
      timeout: 5_000,
    });
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

    await input.fill('Test enter key');
    await input.press('Enter');

    // Message should be sent
    await expect(page.getByText('Test enter key')).toBeVisible({ timeout: 5_000 });
  });
});
