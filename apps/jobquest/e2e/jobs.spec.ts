import { expect, test } from './fixtures';

test.describe('job listings', () => {
  test('edit, delete, open a job and come back to the list as it was', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { level: 1, name: 'Job Listings' })).toBeVisible();
    await expect(page.getByText('Showing 6 of 6 jobs')).toBeVisible();

    // Edit in the dialog, which starts on the first field
    await page
      .getByRole('button', { name: 'Edit QA Automation Engineer at Brightwater Freight' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit QA Automation Engineer' });
    await expect(dialog.getByRole('textbox', { name: 'Job title (required)' })).toBeFocused();
    await dialog.getByRole('textbox', { name: 'Notes' }).fill('Phone screen booked');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Saved QA Automation Engineer.')).toBeVisible();

    // Delete takes a second click
    await page
      .getByRole('button', { name: 'Delete Junior Web Developer at Tidepool Analytics' })
      .click();
    await page
      .getByRole('button', { name: 'Yes, delete Junior Web Developer at Tidepool Analytics' })
      .click();
    await expect(page.getByText('Showing 5 of 5 jobs')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Junior Web Developer' })).toHaveCount(0);

    // Search, open a job, and Back returns to the searched list
    await page.getByRole('searchbox', { name: 'Search title or company' }).fill('brightwater');
    await expect(page).toHaveURL(/\/jobs\?q=brightwater$/);
    await page
      .getByRole('link', { name: 'View QA Automation Engineer at Brightwater Freight' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'QA Automation Engineer' })
    ).toBeVisible();
    await expect(page.getByText('Phone screen booked')).toBeVisible();
    await page.getByRole('button', { name: 'Back to job listings' }).click();
    await expect(page).toHaveURL(/\/jobs\?q=brightwater$/);
    await expect(page.getByText('Showing 1 of 5 jobs')).toBeVisible();

    // The browser's own Back button works too
    await page
      .getByRole('link', { name: 'View QA Automation Engineer at Brightwater Freight' })
      .click();
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Search title or company' })).toHaveValue(
      'brightwater'
    );
  });

  test('a deep link to a job loads it, with the security headers', async ({ page }) => {
    await page.goto('/jobs');
    const firstJob = page.getByRole('link', { name: 'Frontend Developer', exact: true });
    const href = await firstJob.getAttribute('href');

    const response = await page.goto(href ?? '/');

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
    await expect(page.getByRole('heading', { level: 1, name: 'Frontend Developer' })).toBeVisible();
  });
});
