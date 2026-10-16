import { expect, type Page, test } from '@playwright/test';
import { STUB_GAP_ISSUE, STUB_TEMPLATE_CONTENT } from '../test/fake-openai/constants';

/**
 * E2E tests for gap analysis + "Fix with AI" flow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - The Getting Started workspace every new account gets
 *  - The stub OpenAI server (test/fake-openai): its gap analysis reports one
 *    finding per empty section, and Fix with AI on an empty section gets
 *    content in that section template's shape
 *
 * Each Fix with AI test makes a workspace of its own with one empty section
 * of each type, since fixing one changes it.
 */

const GAP_SECTIONS = [
  { title: 'Summary', template: 'prose' },
  { title: 'Sources & References', template: 'table' },
  { title: 'Key Findings', template: 'cards' },
  { title: 'Open Questions', template: 'checklist' },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

async function goToWorkspace(page: Page, slug: string) {
  await page.goto(`/workspaces/${slug}`);
  await page.waitForLoadState('networkidle');
}

/** A workspace of its own with the empty GAP_SECTIONS, opened. */
async function goToNewGapWorkspace(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await page.request.post('/api/workspaces', {
    data: {
      title: `E2E Gaps ${unique}`,
      slug: `e2e-gaps-${unique}`,
      templateId: 'custom',
      customSections: GAP_SECTIONS,
    },
  });
  expect(res.ok()).toBe(true);
  await goToWorkspace(page, `e2e-gaps-${unique}`);
}

async function runGapAnalysis(page: Page) {
  // "Run Analysis" the first time; after that, the refresh button in the gap panel
  await page
    .getByRole('button', { name: 'Run Analysis' })
    .or(page.getByRole('button', { name: 'Run analysis again' }))
    .first()
    .click();
  // The panel's "N gaps" heading (sections show "N gap" badges too) or the healthy bar
  await expect(
    page
      .getByText(/^\d+ gaps?$/)
      .or(page.getByText('All sections healthy'))
      .first()
  ).toBeVisible({ timeout: 30_000 });
}

/** A section's stub finding in the (expanded) gap panel: the section title, then the issue. */
const finding = (page: Page, sectionTitle: string) =>
  page
    .locator('div.rounded.border')
    .filter({ has: page.getByRole('button', { name: `${sectionTitle} — ${STUB_GAP_ISSUE}` }) });

/** A section's card on the workspace page. */
const section = (page: Page, title: string) =>
  page
    .locator('main div.rounded-lg.border')
    .filter({ has: page.getByRole('heading', { name: title, level: 3, exact: true }) })
    .last();

/** Fix with AI on a section's finding, then waits for the preview. */
async function fixWithAi(page: Page, sectionTitle: string) {
  await finding(page, sectionTitle).getByRole('button', { name: 'Fix', exact: true }).click();
  await expect(page.getByText(`AI Fix Preview — ${sectionTitle}`)).toBeVisible({
    timeout: 30_000,
  });
}

/** Fix with AI on a section, then Accept. */
async function fixAndAccept(page: Page, sectionTitle: string) {
  await fixWithAi(page, sectionTitle);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText(/^AI Fix Preview/)).not.toBeVisible();
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
    await goToNewGapWorkspace(page);
    await runGapAnalysis(page);

    // One AI finding per empty section, each matched to its section, so it can be fixed
    await expect(page.getByRole('button', { name: STUB_GAP_ISSUE })).toHaveCount(
      GAP_SECTIONS.length
    );
    for (const { title } of GAP_SECTIONS) {
      await expect(
        finding(page, title).getByRole('button', { name: 'Fix', exact: true })
      ).toBeVisible();
    }
  });
});

// ── Fix with AI - Prose ────────────────────────────────────────────────────

test.describe('Fix with AI - Prose', () => {
  test('shows diff preview, accept saves new version', async ({ page }) => {
    await goToNewGapWorkspace(page);
    await runGapAnalysis(page);

    await fixWithAi(page, 'Summary');
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByText(/^AI Fix Preview/)).not.toBeVisible();

    // The new version is recorded as an AI gap fill
    await section(page, 'Summary').getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'History', exact: true }).click();
    await expect(page.getByText('AI Gap Fill').first()).toBeVisible({ timeout: 5_000 });
  });

  test('reject discards changes', async ({ page }) => {
    await goToNewGapWorkspace(page);
    await runGapAnalysis(page);

    await fixWithAi(page, 'Summary');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();

    await expect(page.getByText(/^AI Fix Preview/)).not.toBeVisible();
    await expect(section(page, 'Summary').getByText(/^No content yet/)).toBeVisible();
  });

  test('generates content for empty prose section', async ({ page }) => {
    await goToNewGapWorkspace(page);
    await expect(section(page, 'Summary').getByText(/^No content yet/)).toBeVisible();
    await runGapAnalysis(page);

    await fixAndAccept(page, 'Summary');

    await expect(section(page, 'Summary').getByText(/^No content yet/)).not.toBeVisible();
    await expect(section(page, 'Summary')).toContainText(STUB_TEMPLATE_CONTENT.prose ?? '');
  });
});

// ── Fix with AI - Structured Sections ──────────────────────────────────────

test.describe('Fix with AI - Structured Sections', () => {
  test('table section: generates data that renders as a table, not empty', async ({ page }) => {
    await goToNewGapWorkspace(page);
    await runGapAnalysis(page);

    await fixAndAccept(page, 'Sources & References');

    const table = section(page, 'Sources & References');
    await expect(table.locator('table')).toBeVisible();
    await expect(table.getByRole('cell', { name: 'Generated row' })).toBeVisible();
    await expect(table.getByText(/^No table data yet/)).not.toBeVisible();
  });

  test('cards section: generates data that renders as cards, not empty', async ({ page }) => {
    await goToNewGapWorkspace(page);
    await runGapAnalysis(page);

    await fixAndAccept(page, 'Key Findings');

    const cards = section(page, 'Key Findings');
    await expect(cards.getByText('Generated card')).toBeVisible();
    await expect(cards.getByText(/^No cards yet/)).not.toBeVisible();
  });

  test('checklist section: generates data that renders as checklist items, not empty', async ({
    page,
  }) => {
    await goToNewGapWorkspace(page);
    await runGapAnalysis(page);

    await fixAndAccept(page, 'Open Questions');

    const checklist = section(page, 'Open Questions');
    await expect(checklist.getByText('Generated item', { exact: true })).toBeVisible();
    await expect(checklist.getByText(/^No checklist items yet/)).not.toBeVisible();
  });
});
