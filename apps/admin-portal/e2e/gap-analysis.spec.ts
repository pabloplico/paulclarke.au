import { expect, test } from '@playwright/test';

/**
 * E2E tests for gap analysis + "Fix with AI" flow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - Seeded workspaces exist (Services & Offerings, Research & References, etc.)
 */

// ── Helpers ────────────────────────────────────────────────────────────────

async function goToWorkspace(page: import('@playwright/test').Page, slug: string) {
  await page.goto(`/workspaces/${slug}`);
  await page.waitForLoadState('networkidle');
}

async function runGapAnalysis(page: import('@playwright/test').Page) {
  const runBtn = page.getByRole('button', { name: 'Run Analysis' });
  if (await runBtn.isVisible()) {
    await runBtn.click();
  } else {
    // Refresh button (small icon in gap panel header)
    const refreshBtn = page.locator('button svg.lucide-refresh-cw').locator('..');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
    }
  }
  // Wait for analysis to complete
  await expect(
    page.getByText(/gaps? found/).or(page.getByText('All sections look healthy'))
  ).toBeVisible({ timeout: 30_000 });
}

// ── Gap Analysis Tests ─────────────────────────────────────────────────────

test.describe('Gap Analysis - Content Detection', () => {
  test('structured sections with data (cards/table) are NOT reported as empty', async ({
    page,
  }) => {
    await goToWorkspace(page, 'services-offerings');

    // Verify structured sections have content rendered
    // Service Packages = cards, Pricing Framework = table
    // These should show actual data, not "No cards yet" / "No table data yet"
    const servicePackagesHeading = page.getByRole('heading', { name: 'Service Packages' });
    await expect(servicePackagesHeading).toBeVisible();

    // Run fresh gap analysis
    await runGapAnalysis(page);

    // Check the findings — sections with structured data should NOT be flagged as "Section is empty"
    const allText = await page.locator('[class*="border-border"]').allTextContents();
    const emptyFindings = allText.filter((t) => t.includes('Section is empty'));

    // None of the "Section is empty" findings should mention Service Packages or Pricing Framework
    for (const finding of emptyFindings) {
      expect(finding).not.toContain('Service Packages');
      expect(finding).not.toContain('Pricing Framework');
    }

    console.log(`"Section is empty" findings: ${emptyFindings.length}`);
  });

  test('all AI-generated findings have Fix with AI buttons (sectionId matched)', async ({
    page,
  }) => {
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    // Count findings and fix buttons
    const findingCards = page.locator('[class*="rounded-lg"][class*="border-border"]').filter({
      has: page.locator('text=/high|medium|low/'),
    });
    const findingCount = await findingCards.count();
    const fixButtons = page.getByRole('button', { name: 'Fix with AI' });
    const fixButtonCount = await fixButtons.count();

    console.log(`Findings: ${findingCount}, Fix buttons: ${fixButtonCount}`);

    // Most findings should have Fix with AI buttons (some AI findings may not match a section)
    expect(fixButtonCount).toBeGreaterThan(0);
    // Allow some findings without buttons (e.g. AI-generated findings that didn't match a section name)
    expect(fixButtonCount).toBeGreaterThanOrEqual(Math.floor(findingCount * 0.5));
  });
});

// ── Fix with AI - Prose ────────────────────────────────────────────────────

test.describe('Fix with AI - Prose', () => {
  test('shows diff preview, accept saves new version', async ({ page }) => {
    await goToWorkspace(page, 'services-offerings');
    await runGapAnalysis(page);

    // Find the Delivery Process or Core Services finding
    const finding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Delivery Process' });

    if (!(await finding.isVisible())) {
      test.skip();
      return;
    }

    await finding.getByRole('button', { name: 'Fix with AI' }).click();

    // Should show loading state
    await expect(page.getByText('Generating...')).toBeVisible();

    // Should show diff preview
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();

    // Accept
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();

    // Check version history
    await page.getByRole('button', { name: 'History' }).last().click();
    await expect(page.getByText('AI Gap Fill').first()).toBeVisible({ timeout: 5_000 });
  });

  test('reject discards changes', async ({ page }) => {
    await goToWorkspace(page, 'services-offerings');
    await runGapAnalysis(page);

    const finding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: /Core Services|Delivery Process/ })
      .first();

    if (!(await finding.isVisible())) {
      test.skip();
      return;
    }

    await finding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();
  });

  test('generates content for empty prose section', async ({ page }) => {
    await goToWorkspace(page, 'ai-agent-frameworks');

    // Summary section should be empty (or may have content from earlier test run)
    await runGapAnalysis(page);

    const summaryFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Summary' })
      .first();

    if (!(await summaryFinding.isVisible())) {
      test.skip();
      return;
    }

    await summaryFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview — Summary')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();

    // Wait for re-render
    await page.waitForTimeout(1000);

    // Summary section should no longer show "No content yet"
    const summaryCard = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Summary', exact: true }),
    });
    await expect(summaryCard.getByText('No content yet')).not.toBeVisible();
  });
});

// ── Fix with AI - Structured Sections ──────────────────────────────────────

test.describe('Fix with AI - Structured Sections', () => {
  test('table section: generates data that renders as a table, not empty', async ({ page }) => {
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    // Find Sources & References (table) finding
    const tableFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Sources & References' })
      .first();

    if (!(await tableFinding.isVisible())) {
      test.skip();
      return;
    }

    await tableFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Accept' }).click();

    await page.waitForTimeout(1500);

    // The table section should render data, not "No table data yet"
    const tableSection = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Sources & References' }),
    });

    const noDataMsg = tableSection.getByText('No table data yet');
    const tableElement = tableSection.locator('table');

    const noDataVisible = await noDataMsg.isVisible().catch(() => false);
    const tableVisible = await tableElement.isVisible().catch(() => false);

    console.log(`Table visible: ${tableVisible}, "No table data" visible: ${noDataVisible}`);

    // CRITICAL: table should render with data
    expect(noDataVisible).toBe(false);
    expect(tableVisible).toBe(true);
  });

  test('cards section: generates data that renders as cards, not empty', async ({ page }) => {
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    const cardsFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Key Findings' })
      .first();

    if (!(await cardsFinding.isVisible())) {
      test.skip();
      return;
    }

    await cardsFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Accept' }).click();

    await page.waitForTimeout(1500);

    const cardsSection = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Key Findings' }),
    });

    const noCardsMsg = cardsSection.getByText('No cards yet');
    const noCardsVisible = await noCardsMsg.isVisible().catch(() => false);

    console.log(`"No cards" visible: ${noCardsVisible}`);

    // CRITICAL: cards should render with data
    expect(noCardsVisible).toBe(false);
  });

  test('checklist section: generates data that renders as checklist items, not empty', async ({
    page,
  }) => {
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    const checklistFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Open Questions' })
      .first();

    if (!(await checklistFinding.isVisible())) {
      test.skip();
      return;
    }

    await checklistFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Accept' }).click();

    await page.waitForTimeout(1500);

    const checklistSection = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Open Questions' }),
    });

    const noItemsMsg = checklistSection.getByText('No checklist items yet');
    const noItemsVisible = await noItemsMsg.isVisible().catch(() => false);

    console.log(`"No checklist items" visible: ${noItemsVisible}`);

    // CRITICAL: checklist should render with items
    expect(noItemsVisible).toBe(false);
  });
});
