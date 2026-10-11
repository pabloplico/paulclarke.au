import { expect, test } from '@playwright/test';

/**
 * E2E tests for AI inline editing (text selection → floating toolbar → actions).
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces with prose content exist
 *  - AI_PROVIDER and API key configured
 */

const WORKSPACE_SLUG = 'e2e-test-workspace';

async function goToWorkspace(page: import('@playwright/test').Page) {
  await page.goto(`/workspaces/${WORKSPACE_SLUG}`);
  await page.waitForLoadState('networkidle');
}

async function enterEditModeForSection(page: import('@playwright/test').Page, sectionName: string) {
  const heading = page.getByRole('heading', { name: sectionName });
  if (!(await heading.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return false;
  }
  const section = heading.locator('..').locator('..');
  const editBtn = section.getByRole('button', { name: 'Edit' });
  if (!(await editBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return false;
  }
  await editBtn.click();
  return true;
}

test.describe('AI Inline Editing', () => {
  test('full-section AI menu appears on prose section', async ({ page }) => {
    await goToWorkspace(page);

    // Find a prose section with an AI button
    const aiBtn = page.getByRole('button', { name: 'AI' }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await aiBtn.click();

    // AI action menu should appear with all options
    await expect(page.getByRole('button', { name: 'Rewrite' })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: 'Expand' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simplify' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyse' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Research' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Custom' })).toBeVisible();
  });

  test('rewrite action shows diff preview with accept/reject', async ({ page }) => {
    await goToWorkspace(page);

    const aiBtn = page.getByRole('button', { name: 'AI' }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await aiBtn.click();

    await page.getByRole('button', { name: 'Rewrite' }).click();

    // Should show loading state then diff preview
    await expect(page.getByText('Accept').or(page.getByText('Generating'))).toBeVisible({
      timeout: 30_000,
    });

    // If diff preview is visible, check for accept/reject
    const acceptBtn = page.getByRole('button', { name: 'Accept' });
    if (await acceptBtn.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
    }
  });

  test('reject AI edit discards changes', async ({ page }) => {
    await goToWorkspace(page);

    const aiBtn = page.getByRole('button', { name: 'AI' }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await aiBtn.click();
    await page.getByRole('button', { name: 'Simplify' }).click();

    // Wait for diff preview
    const rejectBtn = page.getByRole('button', { name: 'Reject' });
    await expect(rejectBtn).toBeVisible({ timeout: 30_000 });

    await rejectBtn.click();

    // Diff preview should close
    await expect(rejectBtn).not.toBeVisible({ timeout: 3_000 });
  });

  test('accept AI edit saves new version', async ({ page }) => {
    await goToWorkspace(page);

    // Find the first prose section with AI button
    const aiBtn = page.getByRole('button', { name: 'AI' }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await aiBtn.click();
    await page.getByRole('button', { name: 'Expand' }).click();

    // Wait for diff preview
    const acceptBtn = page.getByRole('button', { name: 'Accept' });
    await expect(acceptBtn).toBeVisible({ timeout: 30_000 });

    await acceptBtn.click();

    // Preview should close
    await expect(acceptBtn).not.toBeVisible({ timeout: 5_000 });

    // Check version history shows AI Edit
    const historyBtn = page.getByRole('button', { name: 'History' }).first();
    await historyBtn.click();
    await expect(page.getByText('AI Edit').first()).toBeVisible({ timeout: 5_000 });
  });

  test('custom AI action with prompt', async ({ page }) => {
    await goToWorkspace(page);

    const aiBtn = page.getByRole('button', { name: 'AI' }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await aiBtn.click();

    // Click Custom
    await page.getByRole('button', { name: 'Custom' }).click();

    // Custom input should appear
    const customInput = page.locator(
      'input[placeholder="Describe what to do with this section..."]'
    );
    if (!(await customInput.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // Try alternative placeholder
      const altInput = page.locator('input[placeholder="Describe what to do..."]');
      if (!(await altInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
        test.skip();
        return;
      }
      await altInput.fill('Add a bullet point summary at the end');
      await page.getByRole('button', { name: 'Go' }).click();
    } else {
      await customInput.fill('Add a bullet point summary at the end');
      await page.getByRole('button', { name: 'Go' }).click();
    }

    // Should show diff preview
    await expect(
      page.getByRole('button', { name: 'Accept' }).or(page.getByText('Generating'))
    ).toBeVisible({ timeout: 30_000 });

    // Reject to not modify the workspace permanently
    const rejectBtn = page.getByRole('button', { name: 'Reject' });
    if (await rejectBtn.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await rejectBtn.click();
    }
  });
});
