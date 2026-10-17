import { expect, test } from './fixtures';

test('a new visitor starts on their skills, adds one, adds a job and sees their match', async ({
  page,
}) => {
  await page.goto('/');

  // No skills yet: the first unfinished step
  await expect(page).toHaveURL(/\/skills$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My Skills & Gaps' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Skill', exact: true }).fill('TypeScript');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Your skills' }).getByText('TypeScript')
  ).toBeVisible();

  await page.getByRole('link', { name: 'Add Job', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add Job' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Job title (required)' }).fill('Platform Engineer');
  await page.getByRole('textbox', { name: 'Company (required)' }).fill('Example Co');
  await page.getByRole('textbox', { name: 'Skills', exact: true }).fill('TypeScript, Go');
  await page.getByRole('button', { name: 'Add job', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Platform Engineer' })).toBeVisible();
  await expect(page.getByText('50%')).toBeVisible();
  await expect(page.getByText('1 of 2 skills')).toBeVisible();

  // Now that there are skills, / goes to the job list
  await page.goto('/');
  await expect(page).toHaveURL(/\/jobs$/);
});
