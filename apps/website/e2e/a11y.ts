import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Run axe (WCAG 2.0/2.1 A and AA) on the current page and fail on any serious or critical
 * violation. The failure message lists each rule and the offending selectors.
 */
export async function expectNoSeriousA11yViolations(page: Page) {
  // Wait out the page's fade-in (section-enter): mid-fade text has partial opacity, which axe
  // reports as low contrast. Infinite animations (pulse, bob) are skipped so this can't hang.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished)
    )
  );

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

  expect(serious, 'serious or critical accessibility violations').toEqual([]);
}
