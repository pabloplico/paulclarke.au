import { expect, test } from '@playwright/test';
import { STUB_CHAT_ANSWER } from '../test/fake-openai/constants';

/**
 * E2E tests for workspace-scoped chat panel.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts
 *  - The stub OpenAI server (test/fake-openai), which streams a canned answer
 *    after half a second
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
    const chatBtn = page.getByRole('button', { name: 'Open chat' });
    await expect(chatBtn).toBeVisible();
  });

  test('clicking chat button opens chat panel', async ({ page }) => {
    await goToWorkspace(page);

    const chatBtn = page.getByRole('button', { name: 'Open chat' });
    await chatBtn.click();

    // Chat panel should appear with workspace title and input
    await expect(page.locator('textarea[placeholder="Ask a question..."]')).toBeVisible({
      timeout: 3_000,
    });

    // Empty state message
    await expect(page.getByText('Ask anything about this workspace')).toBeVisible();
  });

  test('send a message and receive response', async ({ page }) => {
    // A workspace of its own, so the panel has no earlier conversation to reopen
    const slug = `e2e-chat-${Date.now()}`;
    const created = await page.request.post('/api/workspaces', {
      data: { title: `E2E Chat ${slug}`, slug, templateId: 'client-project' },
    });
    expect(created.ok()).toBe(true);
    await page.goto(`/workspaces/${slug}`);
    await page.waitForLoadState('networkidle');

    // Open chat
    const chatBtn = page.getByRole('button', { name: 'Open chat' });
    await chatBtn.click();

    const input = page.locator('textarea[placeholder="Ask a question..."]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    const panel = page.getByRole('dialog', { name: 'Chat panel' });

    // Type a message
    await input.fill('What is the project overview?');

    // Click send button
    const sendBtn = page.getByRole('button', { name: 'Send message' });
    await sendBtn.click();

    // User message should appear
    await expect(panel.getByText('What is the project overview?')).toBeVisible();

    // Loading indicator should appear (the stub waits half a second before answering)
    await expect(panel.getByRole('status', { name: 'Waiting for the answer' })).toBeVisible({
      timeout: 3_000,
    });

    // The streamed answer appears, once, after the question
    await expect(panel.getByText(STUB_CHAT_ANSWER)).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByText('Ask anything about this workspace')).not.toBeVisible();
  });

  test('clear chat removes messages', async ({ page }) => {
    await goToWorkspace(page);

    // Open chat
    const chatBtn = page.getByRole('button', { name: 'Open chat' });
    await chatBtn.click();

    const input = page.locator('textarea[placeholder="Ask a question..."]');
    await expect(input).toBeVisible({ timeout: 3_000 });

    // Send a message first (unique: the panel reopens the last conversation)
    const message = `Hello ${Date.now()}`;
    await input.fill(message);
    const sendBtn = page.getByRole('button', { name: 'Send message' });
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
    const chatBtn = page.getByRole('button', { name: 'Open chat' });
    await chatBtn.click();

    await expect(page.locator('textarea[placeholder="Ask a question..."]')).toBeVisible({
      timeout: 3_000,
    });

    // Close via the X button in the chat panel header
    const closeBtn = page.getByRole('button', { name: 'Close chat' });
    await closeBtn.click();

    // Chat input should no longer be visible
    await expect(page.locator('textarea[placeholder="Ask a question..."]')).not.toBeVisible();
  });

  test('send message with Enter key', async ({ page }) => {
    await goToWorkspace(page);

    // Open chat
    const chatBtn = page.getByRole('button', { name: 'Open chat' });
    await chatBtn.click();

    const input = page.locator('textarea[placeholder="Ask a question..."]');
    await expect(input).toBeVisible({ timeout: 3_000 });

    const message = `Test enter key ${Date.now()}`;
    await input.fill(message);
    await input.press('Enter');

    await expect(page.getByText(message)).toBeVisible({ timeout: 5_000 });
  });
});
