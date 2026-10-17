import { expect, test } from './fixtures';

test('a new visitor sees how it works, opens the guide and jumps to a section', async ({
  page,
}) => {
  await page.goto('/');

  const steps = page.getByRole('region', { name: 'How it works' });
  await expect(steps.getByRole('heading', { level: 3 })).toHaveText([
    'Add your skills',
    'Collect jobs',
    'Spot trends',
    'Close the gap',
  ]);
  await steps.getByRole('link', { name: 'Read the full guide' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Contents' })
    .getByRole('link', { name: 'Taxonomy (advanced)' })
    .click();

  await expect(page).toHaveURL(/\/help#taxonomy$/);
  const section = page.getByRole('region', { name: 'Taxonomy (advanced)' });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();

  // A new page starts at the top, whatever the scroll position before
  await section.getByRole('link', { name: 'Go to Taxonomy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Taxonomy' })).toBeInViewport();
});
