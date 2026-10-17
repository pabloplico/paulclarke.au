import { expect, test } from './fixtures';

/** The job count Analytics' table shows for a skill, or null if it isn't listed. */
async function demandFor(page: import('@playwright/test').Page, skill: string) {
  const table = page.getByRole('table', { name: 'Skills in demand, by group' });
  // Case-insensitive: the table capitalises names with CSS
  const name = new RegExp(`^${skill}$`, 'i');
  const row = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) });
  return (await row.count()) === 0 ? null : row.getByRole('cell').textContent();
}

test('a merge on Taxonomy changes the counts in Analytics', async ({ page }) => {
  await page.goto('/analytics?view=table');
  await expect(page.getByRole('table', { name: 'Skills in demand, by group' })).toBeVisible();
  expect(await demandFor(page, 'javascript')).toBe('3');
  expect(await demandFor(page, 'typescript')).toBe('4');

  await page.getByRole('link', { name: 'Taxonomy' }).click();
  await page.getByRole('combobox', { name: 'Count this skill' }).fill('TypeScript');
  await page.getByRole('combobox', { name: 'as', exact: true }).fill('JavaScript');
  await page.getByRole('button', { name: 'Merge' }).click();
  await expect(page.getByText('typescript now counts as javascript.')).toBeVisible();

  await page.getByRole('link', { name: 'Analytics' }).click();
  await page.getByRole('button', { name: 'Show as tables' }).click();
  await expect(page.getByRole('table', { name: 'Skills in demand, by group' })).toBeVisible();
  // Six jobs ask for one or the other (one asks for both, counted once)
  expect(await demandFor(page, 'javascript')).toBe('6');
  expect(await demandFor(page, 'typescript')).toBeNull();
});

test('groups a skill from the jobs, and the group lists it', async ({ page }) => {
  await page.goto('/taxonomy');

  await page.getByRole('combobox', { name: 'Group for figma' }).selectOption('Developer tools');
  await page.getByRole('button', { name: 'Add figma to the group' }).click();

  await expect(
    page.getByRole('list', { name: 'Skills in Developer tools' }).getByText('figma')
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Group for figma' })).toHaveCount(0);
});
