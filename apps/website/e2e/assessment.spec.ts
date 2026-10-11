import { expect, type Page, test } from '@playwright/test';

/** Choose an industry and a maturity level: the minimum needed for results. */
async function completeQuickAssessment(page: Page) {
  await page.getByRole('button', { name: 'Retail & E-Commerce' }).click();
  await page.getByRole('button', { name: /^Developing/ }).click();
}

test.describe('assessment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/assessment');
  });

  test('shows the demo banner and waits for input before scoring', async ({ page }) => {
    await expect(
      page.getByText('A demo project: a free AI readiness assessment I built for small businesses.')
    ).toBeVisible();
    await expect(page.getByText('Select industry to begin')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download/ })).toHaveCount(0);
  });

  test('completing the quick assessment produces a score and a 90-day plan', async ({ page }) => {
    await completeQuickAssessment(page);

    await expect(page.getByRole('button', { name: 'Retail & E-Commerce' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: /^Developing/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // "Developing" with no star ratings scores 38/100 in every dimension
    await expect(page.getByText('38', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your 90-Day AI Action Plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download/ })).toBeVisible();
  });

  test('detailed analysis works by keyboard alone', async ({ page }) => {
    await completeQuickAssessment(page);

    const detailed = page.getByRole('switch', { name: 'Detailed Analysis' });
    await expect(detailed).toHaveAttribute('aria-checked', 'false');
    await detailed.focus();
    await page.keyboard.press('Space');
    await expect(detailed).toHaveAttribute('aria-checked', 'true');

    // Each question is a labelled group of named star buttons
    const question = page.getByRole('group', { name: 'Decision Ownership' });
    const threeStars = question.getByRole('button', { name: '3 of 4' });
    await threeStars.focus();
    await page.keyboard.press('Enter');
    await expect(threeStars).toHaveAttribute('aria-pressed', 'true');
    await expect(detailed).toHaveAccessibleDescription(/1\/10 rated/);

    // The breakdown unlocks once there are ratings
    const breakdown = page.getByRole('button', { name: /Breakdown/ });
    await expect(breakdown).toBeEnabled();
    await breakdown.click();
    await expect(breakdown).toHaveAttribute('aria-expanded', 'true');
  });

  test('pain points allow at most three choices', async ({ page }) => {
    await completeQuickAssessment(page);
    await page.getByRole('switch', { name: /Pain Points/ }).click();

    const boxes = page.getByRole('checkbox');
    for (let i = 0; i < 3; i++) await boxes.nth(i).check();

    await expect(boxes.nth(3)).toBeDisabled();
    await boxes.nth(0).uncheck();
    await expect(boxes.nth(3)).toBeEnabled();
  });

  test('answers survive in-app navigation away and back', async ({ page }) => {
    await completeQuickAssessment(page);

    await page.goto('/assessment'); // sanity: a full reload starts fresh (answers stay in the browser tab only)
    await expect(page.getByRole('button', { name: 'Retail & E-Commerce' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    await completeQuickAssessment(page);
    await page.getByRole('link', { name: 'Paul Clarke' }).first().click(); // logo -> home
    await expect(page).toHaveURL('/');
    await page.goBack();

    await expect(page).toHaveURL('/assessment');
    await expect(page.getByRole('button', { name: 'Retail & E-Commerce' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('download opens the print dialog and restart clears everything', async ({ page }) => {
    await page.addInitScript(() => {
      // Record calls instead of opening a real print dialog
      (window as unknown as { printCalls: number }).printCalls = 0;
      window.print = () => {
        (window as unknown as { printCalls: number }).printCalls++;
      };
    });
    await page.goto('/assessment');
    await completeQuickAssessment(page);

    await page.getByRole('button', { name: /Download/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { printCalls: number }).printCalls))
      .toBe(1);

    await page.getByRole('button', { name: /Start over|Restart/ }).click();
    await expect(page.getByText('Select industry to begin')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retail & E-Commerce' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
