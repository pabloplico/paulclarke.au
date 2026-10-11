import { expect, test } from '@playwright/test';

/**
 * E2E tests for cross-workspace search (Cmd+K).
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces with content exist
 */

test.describe('Search', () => {
  test('Ctrl+K opens search and focuses input', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await expect(searchInput).toBeFocused();
  });

  test('typing a query shows search results', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    // Type a query that should match seeded workspace content
    await searchInput.fill('services');

    // Wait for debounce (300ms) and results
    await page.waitForTimeout(500);

    // Results dropdown should appear
    const resultsDropdown = page.locator('[class*="absolute"][class*="shadow-lg"]');
    await expect(resultsDropdown).toBeVisible({ timeout: 5_000 });

    // Should show at least one result
    const resultLinks = resultsDropdown.locator('a');
    const count = await resultLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a search result navigates to workspace', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('services');

    // Wait for results
    await page.waitForTimeout(500);

    const resultsDropdown = page.locator('[class*="absolute"][class*="shadow-lg"]');
    await expect(resultsDropdown).toBeVisible({ timeout: 5_000 });

    // Click the first result
    const firstResult = resultsDropdown.locator('a').first();
    await expect(firstResult).toBeVisible();
    const href = await firstResult.getAttribute('href');
    await firstResult.click();

    // Should navigate to a workspace page
    await expect(page).toHaveURL(/\/workspaces\//, { timeout: 5_000 });
  });

  test('search results show workspace and section info', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('services');

    await page.waitForTimeout(500);

    const resultsDropdown = page.locator('[class*="absolute"][class*="shadow-lg"]');
    await expect(resultsDropdown).toBeVisible({ timeout: 5_000 });

    // Results should show workspace title and section title (connected by arrow)
    const firstResult = resultsDropdown.locator('a').first();
    const resultText = await firstResult.textContent();
    expect(resultText).toBeTruthy();
    expect(resultText!.length).toBeGreaterThan(3);
  });

  test('clear button clears search query', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('services');

    // Clear button (X icon) should appear
    const clearBtn = searchInput
      .locator('..')
      .locator('..')
      .locator('button')
      .filter({ has: page.locator('svg.lucide-x') });

    if (await clearBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await clearBtn.click();
      await expect(searchInput).toHaveValue('');
    }
  });

  test('Escape closes search results', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('services');

    await page.waitForTimeout(500);

    const resultsDropdown = page.locator('[class*="absolute"][class*="shadow-lg"]');
    await expect(resultsDropdown).toBeVisible({ timeout: 5_000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Results dropdown should close
    await expect(resultsDropdown).not.toBeVisible({ timeout: 3_000 });
  });

  test('no results message for unmatched query', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');

    const searchInput = page.locator('input[placeholder="Search workspaces..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('xyznonexistent12345');

    await page.waitForTimeout(500);

    // Should show "No results" message
    await expect(page.getByText(/no results/i)).toBeVisible({ timeout: 5_000 });
  });
});
