import { expectNoSeriousA11yViolations } from '@repo/playwright-a11y';
import { expect, test } from './fixtures';

test.describe('accessibility (axe, WCAG 2.1 A and AA)', () => {
  test('My Skills & Gaps, empty and with a skill', async ({ page }) => {
    await page.goto('/skills');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole('textbox', { name: 'Skill', exact: true }).fill('Vue');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Your skills' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('job listings, with the edit dialog open', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByRole('table')).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole('button', { name: /^Edit Frontend Developer/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('a job', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: /^View Frontend Developer/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Frontend Developer' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('Add Job, with its errors showing', async ({ page }) => {
    await page.goto('/jobs/new');
    await page.getByRole('button', { name: 'Add job', exact: true }).click();
    await expect(page.getByText('Enter a job title')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('a page that does not exist', async ({ page }) => {
    await page.goto('/no/such/page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
