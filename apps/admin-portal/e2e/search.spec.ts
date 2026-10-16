import { expect, test } from '@playwright/test';

/**
 * E2E tests for cross-workspace search (Cmd+K).
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts, whose "Project Overview"
 *    section the queries below find
 */

/** The search results: links in the header to a workspace. */
const results = (page: import('@playwright/test').Page) =>
  page.getByRole('banner').getByRole('link', { name: /Project Overview/ });

test.describe('Search', () => {
  test('Ctrl+K opens search and focuses input', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await expect(searchInput).toBeFocused();
  });

  test('typing a query shows search results', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    await searchInput.fill('Project Overview');

    await expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    await expect(results(page).filter({ hasText: 'E2E Test Workspace' })).toBeVisible();
  });

  test('clicking a search result navigates to workspace', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('Project Overview');

    const result = results(page).filter({ hasText: 'E2E Test Workspace' });
    await expect(result).toBeVisible();
    await result.click();

    await expect(page).toHaveURL(/\/workspaces\/e2e-test-workspace/);
  });

  test('search results show workspace and section info', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('Project Overview');

    // Workspace title, then section title, then a preview of the content
    await expect(results(page).filter({ hasText: 'E2E Test Workspace' })).toContainText(
      /E2E Test Workspace\s*Project Overview/
    );
  });

  test('clear button clears search query', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('Project Overview');

    await page.getByRole('button', { name: 'Clear search' }).click();

    await expect(searchInput).toHaveValue('');
  });

  test('Escape closes search results', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('Project Overview');

    await expect(results(page).first()).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(results(page)).toHaveCount(0);
  });

  test('no results message for unmatched query', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.getByRole('combobox', { name: 'Search workspaces' });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('xyznonexistent12345');

    await expect(page.getByText('No results for "xyznonexistent12345"')).toBeVisible();
  });
});
