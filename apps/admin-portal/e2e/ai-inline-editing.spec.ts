import { expect, type Page, test } from '@playwright/test';

/**
 * E2E tests for AI inline editing (a section's "AI Actions" → diff preview →
 * accept or reject).
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The E2E Test Workspace from auth.setup.ts (its "Project Overview" prose section)
 *  - The stub OpenAI server (test/fake-openai), which answers an edit with
 *    the section's content marked "Revised:"
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';
const SECTION = 'Project Overview';

async function goToWorkspace(page: Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
}

/** Opens a section's AI actions from its "More actions" menu. */
async function openAiActions(page: Page, title = SECTION) {
  await page
    .locator('main div.rounded-lg.border')
    .filter({ has: page.getByRole('heading', { name: title, level: 3, exact: true }) })
    .last()
    .getByRole('button', { name: 'More actions' })
    .click();
  await page.getByRole('menuitem', { name: 'AI Actions', exact: true }).click();
}

test.describe('AI Inline Editing', () => {
  test('full-section AI menu appears on prose section', async ({ page }) => {
    await goToWorkspace(page);

    await openAiActions(page);

    for (const action of ['Rewrite', 'Expand', 'Simplify', 'Analyse', 'Research', 'Custom']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible();
    }
  });

  test('rewrite action shows diff preview with accept/reject', async ({ page }) => {
    await goToWorkspace(page);
    await openAiActions(page);

    await page.getByRole('button', { name: 'Rewrite', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
  });

  test('reject AI edit discards changes', async ({ page }) => {
    await goToWorkspace(page);
    await openAiActions(page);
    await page.getByRole('button', { name: 'Simplify', exact: true }).click();

    const rejectBtn = page.getByRole('button', { name: 'Reject' });
    await expect(rejectBtn).toBeVisible({ timeout: 30_000 });
    await rejectBtn.click();

    await expect(rejectBtn).not.toBeVisible();
  });

  test('accept AI edit saves new version', async ({ page }) => {
    await goToWorkspace(page);
    await openAiActions(page);
    await page.getByRole('button', { name: 'Expand', exact: true }).click();

    const acceptBtn = page.getByRole('button', { name: 'Accept' });
    await expect(acceptBtn).toBeVisible({ timeout: 30_000 });
    await acceptBtn.click();
    await expect(acceptBtn).not.toBeVisible();

    // The new version is recorded as an AI edit
    await page
      .locator('main div.rounded-lg.border')
      .filter({ has: page.getByRole('heading', { name: SECTION, level: 3, exact: true }) })
      .last()
      .getByRole('button', { name: 'More actions' })
      .click();
    await page.getByRole('menuitem', { name: 'History', exact: true }).click();
    await expect(page.getByRole('button', { name: /^v\d+ AI Edit/ }).first()).toBeVisible();
  });

  test('custom AI action with prompt', async ({ page }) => {
    await goToWorkspace(page);
    await openAiActions(page);

    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await page
      .getByPlaceholder(/Describe what to do/)
      .fill('Add a bullet point summary at the end');
    await page.getByRole('button', { name: 'Go' }).click();

    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 30_000 });
    // Reject, so the workspace isn't changed
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('button', { name: 'Reject' })).not.toBeVisible();
  });
});
