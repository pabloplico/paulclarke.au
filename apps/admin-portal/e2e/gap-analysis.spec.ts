import { expect, test } from '@playwright/test';

/**
 * E2E tests for gap analysis + "Fix with AI" flow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The Getting Started workspace every new account gets
 *
 * Gap analysis runs its rule-based checks without AI. Its AI checks and
 * "Fix with AI" need a model, and the E2E run has none, so those tests are
 * test.fixme. Their bodies also need seeded workspaces (services-offerings,
 * ai-agent-frameworks) that a fresh E2E database doesn't have.
 */

const NEEDS_AI =
  'Needs an AI provider (AI findings and Fix with AI) and the seeded demo workspaces; the E2E run has neither (no fake provider exists for E2E yet)';

// ── Helpers ────────────────────────────────────────────────────────────────

async function goToWorkspace(page: import('@playwright/test').Page, slug: string) {
  await page.goto(`/workspaces/${slug}`);
  await page.waitForLoadState('networkidle');
}

async function runGapAnalysis(page: import('@playwright/test').Page) {
  // "Run Analysis" the first time; after that, the refresh button in the gap panel
  await page
    .getByRole('button', { name: 'Run Analysis' })
    .or(page.getByRole('button', { name: 'Run analysis again' }))
    .first()
    .click();
  await expect(
    page.getByText(/gaps? found/).or(page.getByText('All sections healthy'))
  ).toBeVisible({ timeout: 30_000 });
}

// ── Gap Analysis Tests ─────────────────────────────────────────────────────

test.describe('Gap Analysis - Content Detection', () => {
  test('structured sections with data (cards/table) are NOT reported as empty', async ({
    page,
  }) => {
    // Getting Started has one section of every type, all with content:
    // Features to Try (cards), Keyboard Shortcuts (table), Getting Started
    // Checklist (checklist) and Your Setup (key-value)
    const workspaces: { slug: string }[] = await (await page.request.get('/api/workspaces')).json();
    const slug = workspaces.find((w) => w.slug.startsWith('getting-started'))?.slug;
    expect(slug).toBeDefined();
    await goToWorkspace(page, slug ?? '');
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts', level: 3 })).toBeVisible();

    await runGapAnalysis(page);

    await expect(page.getByText('All sections healthy')).toBeVisible();
    await expect(page.getByText('Section is empty')).toHaveCount(0);
  });

  test('all AI-generated findings have Fix with AI buttons (sectionId matched)', async ({
    page,
  }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
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
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page, 'services-offerings');
    await runGapAnalysis(page);

    // Find the Delivery Process or Core Services finding
    const finding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Delivery Process' });

    await expect(finding).toBeVisible();

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
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page, 'services-offerings');
    await runGapAnalysis(page);

    const finding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: /Core Services|Delivery Process/ })
      .first();

    await expect(finding).toBeVisible();

    await finding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();
  });

  test('generates content for empty prose section', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page, 'ai-agent-frameworks');

    // Summary section should be empty (or may have content from earlier test run)
    await runGapAnalysis(page);

    const summaryFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Summary' })
      .first();

    await expect(summaryFinding).toBeVisible();

    await summaryFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview — Summary')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();

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
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    // Find Sources & References (table) finding
    const tableFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Sources & References' })
      .first();

    await expect(tableFinding).toBeVisible();

    await tableFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Accept' }).click();

    // The table section should render data, not "No table data yet"
    const tableSection = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Sources & References' }),
    });
    await expect(tableSection.locator('table')).toBeVisible();
    await expect(tableSection.getByText('No table data yet')).not.toBeVisible();
  });

  test('cards section: generates data that renders as cards, not empty', async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    const cardsFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Key Findings' })
      .first();

    await expect(cardsFinding).toBeVisible();

    await cardsFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Accept' }).click();

    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();
    const cardsSection = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Key Findings' }),
    });
    await expect(cardsSection.getByText('No cards yet')).not.toBeVisible();
  });

  test('checklist section: generates data that renders as checklist items, not empty', async ({
    page,
  }) => {
    // biome-ignore lint/suspicious/noSkippedTests: needs an AI provider, which the E2E run doesn't have (reason in NEEDS_AI)
    test.fixme(true, NEEDS_AI);
    await goToWorkspace(page, 'ai-agent-frameworks');
    await runGapAnalysis(page);

    const checklistFinding = page
      .locator('[class*="rounded-lg"][class*="border-border"]')
      .filter({ hasText: 'Open Questions' })
      .first();

    await expect(checklistFinding).toBeVisible();

    await checklistFinding.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(page.getByText('AI Fix Preview')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Accept' }).click();

    await expect(page.getByText('AI Fix Preview')).not.toBeVisible();
    const checklistSection = page.locator('[class*="space-y-3"]').filter({
      has: page.getByRole('heading', { name: 'Open Questions' }),
    });
    await expect(checklistSection.getByText('No checklist items yet')).not.toBeVisible();
  });
});
