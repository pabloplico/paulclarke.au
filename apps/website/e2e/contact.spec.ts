import { expect, test } from '@playwright/test';

test.describe('contact', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('labels every field and shows the contact email', async ({ page }) => {
    for (const label of ['Name', 'Email', 'Company (optional)', 'Message']) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'hello@paulclarke.au' })).toHaveAttribute(
      'href',
      'mailto:hello@paulclarke.au'
    );
  });

  test('required fields block an empty submission', async ({ page }) => {
    await page.getByRole('button', { name: 'Open in email' }).click();
    await expect(page.getByLabel('Name')).toHaveJSProperty('validity.valueMissing', true);
    await expect(page.getByText('Email client opened')).toHaveCount(0);
  });

  // Handing the mailto: URL to the OS mail client is outside what a browser test can observe;
  // its exact contents are covered by the buildContactMailto unit tests (src/lib/mailto.test.ts).
  test('submitting confirms the email client opened and can be reset', async ({ page }) => {
    await page.getByLabel('Name').fill('Sam Lee');
    await page.getByLabel('Email').fill('sam@example.com');
    await page.getByLabel('Message').fill('Hello from the E2E test');
    await page.getByRole('button', { name: 'Open in email' }).click();

    await expect(page.getByRole('heading', { name: 'Email client opened' })).toBeVisible();

    await page.getByRole('button', { name: 'Compose another' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Open in email' })).toBeVisible();
  });
});
