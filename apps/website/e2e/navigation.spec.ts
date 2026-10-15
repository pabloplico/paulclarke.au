import { expect, type Page, test } from '@playwright/test';

const PAGES = [
  { link: 'Projects', path: '/projects', h1: 'Projects', title: 'Projects | Paul Clarke' },
  {
    link: 'Assessment',
    path: '/assessment',
    h1: '90-Day AI Action Plan',
    title: 'AI readiness assessment | Paul Clarke',
  },
  { link: 'About', path: '/about', h1: 'Paul Clarke', title: 'About | Paul Clarke' },
  { link: 'Writing', path: '/writing', h1: 'Thoughts & Updates', title: 'Writing | Paul Clarke' },
  { link: 'Contact', path: '/contact', h1: 'Get in Touch', title: 'Contact | Paul Clarke' },
] as const;

const POST_SLUG = 'thinking-about-thinking';

/** Click a main-nav link, opening the mobile menu first when the links are collapsed. */
async function clickNav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name, exact: true })
    .click();
}

test.describe('navigation', () => {
  test('home loads with the portfolio title and no focus stolen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Paul Clarke | Frontend developer, Brisbane');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paul Clarke');

    // First Tab reaches the skip link, which jumps to <main>
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  for (const { link, path, h1, title } of PAGES) {
    test(`nav link "${link}" routes to ${path}, sets the title and focuses the heading`, async ({
      page,
    }) => {
      await page.goto('/');
      await clickNav(page, link);

      await expect(page).toHaveURL(path);
      await expect(page).toHaveTitle(title);
      const heading = page.locator('main h1');
      await expect(heading).toHaveText(h1);
      await expect(heading).toBeFocused();

      const active = page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: link, exact: true });
      // On mobile the menu closes after navigating, so check the desktop list only when visible
      if (await active.first().isVisible()) {
        await expect(active.first()).toHaveAttribute('aria-current', 'page');
      }
    });
  }

  test('Back and Forward move between pages', async ({ page }) => {
    await page.goto('/');
    await clickNav(page, 'Projects');
    await expect(page).toHaveURL('/projects');
    await clickNav(page, 'About');
    await expect(page).toHaveURL('/about');

    await page.goBack();
    await expect(page).toHaveURL('/projects');
    await expect(page.locator('main h1')).toHaveText('Projects');

    await page.goBack();
    await expect(page).toHaveURL('/');

    await page.goForward();
    await expect(page).toHaveURL('/projects');
  });

  test('every page loads directly from its URL (deep links)', async ({ page }) => {
    for (const { path, h1 } of PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('main h1'), path).toHaveText(h1);
    }
  });

  test('a blog post opens from the list and from a deep link', async ({ page }) => {
    await page.goto('/writing');
    await page
      .getByRole('link', { name: /Your AI Tool Isn’t Thinking|Your AI Tool Isn't Thinking/ })
      .click();
    await expect(page).toHaveURL(`/writing/${POST_SLUG}`);
    await expect(page.locator('main h1')).toBeFocused();
    await expect(page).toHaveTitle(/^Your AI Tool Isn.t Thinking.* \| Paul Clarke$/);

    const response = await page.goto(`/writing/${POST_SLUG}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main h1')).toHaveText(/^Your AI Tool Isn.t Thinking/);

    await page.getByRole('link', { name: 'Back to writing' }).click();
    await expect(page).toHaveURL('/writing');
  });

  test('unknown pages and posts show not-found pages', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.locator('main h1')).toHaveText('Page not found');
    await expect(page).toHaveTitle('Page not found | Paul Clarke');

    await page.goto('/writing/no-such-post');
    await expect(page.locator('main h1')).toHaveText('Post not found');
  });

  test('old hash URLs redirect to their new paths', async ({ page }) => {
    await page.goto('/#assess');
    await expect(page).toHaveURL('/assessment');

    await page.goto(`/#posts/${POST_SLUG}`);
    await expect(page).toHaveURL(`/writing/${POST_SLUG}`);

    await page.goto('/#services');
    await expect(page).toHaveURL('/');
  });

  test('project cards are labelled articles and link to the live demo', async ({ page }) => {
    await page.goto('/projects');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole('article', { name: 'AI readiness assessment' })).toBeVisible();

    await page.getByRole('link', { name: 'Try it' }).click();
    await expect(page).toHaveURL('/assessment');
  });

  test('mobile menu exposes its state and closes after choosing a page', async ({
    page,
    isMobile,
  }) => {
    // biome-ignore lint/suspicious/noSkippedTests: runs only in the mobile project
    test.skip(!isMobile, 'mobile layout only');
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#mobile-menu').getByRole('link', { name: 'Contact' }).click();

    await expect(page).toHaveURL('/contact');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
