import { expect, test } from '@playwright/test';

/**
 * E2E tests for error handling and edge cases.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 */

test.describe('Error States', () => {
  test('404 for non-existent workspace', async ({ page }) => {
    const res = await page.goto('/workspaces/this-workspace-does-not-exist-12345');
    await page.waitForLoadState('networkidle');

    // Should show 404 or redirect or show "not found" message
    const is404 = res?.status() === 404;
    const hasNotFound = await page
      .getByText(/not found/i)
      .isVisible()
      .catch(() => false);
    const redirectedAway = !page.url().includes('this-workspace-does-not-exist');

    expect(is404 || hasNotFound || redirectedAway).toBe(true);
  });

  test('404 for non-existent document', async ({ page }) => {
    const res = await page.goto('/documents/99999999');
    await page.waitForLoadState('networkidle');

    const is404 = res?.status() === 404;
    const hasNotFound = await page
      .getByText(/not found/i)
      .isVisible()
      .catch(() => false);
    const redirectedAway = !page.url().includes('99999999');

    expect(is404 || hasNotFound || redirectedAway).toBe(true);
  });

  test('API returns 404 for non-existent workspace', async ({ page }) => {
    const res = await page.request.get('/api/workspaces/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('API rejects invalid workspace creation', async ({ page }) => {
    const res = await page.request.post('/api/workspaces', {
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('API rejects empty inbox note', async ({ page }) => {
    const res = await page.request.post('/api/inbox', {
      data: { title: '', content: '' },
    });
    // Should reject or handle gracefully
    const status = res.status();
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('login API rejects missing fields', async ({ page }) => {
    const res = await page.request.post('/api/auth/login', {
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('signup API rejects missing fields', async ({ page }) => {
    const res = await page.request.post('/api/auth/signup', {
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('signup API rejects short password', async ({ page }) => {
    const res = await page.request.post('/api/auth/signup', {
      data: {
        name: 'Test',
        email: `short-pass-${Date.now()}@test.com`,
        password: '123',
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('search API handles empty query', async ({ page }) => {
    const res = await page.request.get('/api/search?q=');
    // Should return empty results, not crash
    expect(res.ok() || res.status() === 400).toBe(true);

    if (res.ok()) {
      const data = await res.json();
      expect(Array.isArray(data) || typeof data === 'object').toBe(true);
    }
  });

  test('workspace page renders without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/workspaces');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    // Filter out known benign errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('workspace detail page renders without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/workspaces/e2e-test-workspace');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
