import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './a11y';

const ROUTES = ['/', '/projects', '/assessment', '/about', '/writing', '/contact'];

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const path of ROUTES) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });
  }

  test('a blog post has no serious or critical violations', async ({ page }) => {
    await page.goto('/writing/thinking-about-thinking');
    await expect(page.locator('main h1')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('the not-found page has no serious or critical violations', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.locator('main h1')).toHaveText('Page not found');
    await expectNoSeriousA11yViolations(page);
  });

  test('the assessment stays accessible as it fills in', async ({ page }) => {
    await page.goto('/assessment');
    await page.getByRole('button', { name: 'Retail & E-Commerce' }).click();
    await page.getByRole('button', { name: /^Developing/ }).click();
    await expect(page.getByRole('button', { name: /Download/ })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Open every optional panel: star ratings, pain points and the breakdown
    await page.getByRole('switch', { name: 'Detailed Analysis' }).click();
    await page.getByRole('switch', { name: /Pain Points/ }).click();
    await page
      .getByRole('group', { name: 'Decision Ownership' })
      .getByRole('button', { name: '4 of 4' })
      .click();
    await page.getByRole('button', { name: /Breakdown/ }).click();
    await expectNoSeriousA11yViolations(page);
  });

  test('the open mobile menu has no serious or critical violations', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile layout only');
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    await expectNoSeriousA11yViolations(page);
  });
});
