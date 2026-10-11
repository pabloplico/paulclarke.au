import { expect, test } from '@playwright/test';

/**
 * E2E test for the full inbox → routing → approve → workspace update workflow.
 *
 * Pre-conditions:
 *  - Dev server running on localhost:3001
 *  - BullMQ workers running (document-processing + workspace-routing)
 *  - Redis available
 *  - Seeded workspaces exist
 */

const TEST_NOTE_TITLE = `E2E Test Note ${Date.now()}`;
const TEST_NOTE_CONTENT = `
This is a detailed research summary about AI adoption trends in Australian SMEs.
Key findings: 67% of small businesses plan to adopt AI tools by 2027.
The most common use cases are customer service automation, data analysis, and content generation.
Government programs like the SME Digital Adoption Program provide $20,000 grants for AI implementation.
Industry frameworks such as the NIST AI Risk Management Framework are gaining traction.
This material should be routed to the Research & References workspace, specifically Industry Trends.
`.trim();

test.describe('Inbox → Routing → Approve → Workspace Update', () => {
  test('full workflow: add note, wait for routing, approve, verify workspace updated', async ({
    page,
  }) => {
    // ── Step 1: Navigate to Inbox and add a note ───────────────────────────
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Note title').fill(TEST_NOTE_TITLE);
    await page.getByPlaceholder('Paste or type your notes here...').fill(TEST_NOTE_CONTENT);

    const addNoteBtn = page.getByRole('button', { name: 'Add Note' });
    await expect(addNoteBtn).toBeEnabled();
    await addNoteBtn.click();

    // ── Step 2: Verify item appears with pending status ────────────────────
    const testItemCard = page.locator('div').filter({
      has: page.getByRole('heading', { name: TEST_NOTE_TITLE }),
    });
    await expect(testItemCard.first()).toBeVisible({ timeout: 5_000 });
    console.log('Note added to inbox');

    // ── Step 3: Wait for routing to complete ───────────────────────────────
    // Poll via API since the UI polling is every 3s
    await expect(async () => {
      const res = await page.request.get('/api/inbox');
      const items = await res.json();
      const item = items.find((i: { title: string }) => i.title === TEST_NOTE_TITLE);
      expect(item).toBeTruthy();
      expect(item.status).toBe('routed');
    }).toPass({ timeout: 60_000 });

    console.log('Item routed successfully');

    // Refresh the page to ensure UI reflects routed state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // ── Step 4: Get the routing suggestions via API ────────────────────────
    const inboxRes = await page.request.get('/api/inbox');
    const inboxItems = await inboxRes.json();
    const testItem = inboxItems.find((i: { title: string }) => i.title === TEST_NOTE_TITLE);
    expect(testItem.routingResults.length).toBeGreaterThan(0);

    const target = testItem.routingResults[0];
    console.log(
      `Suggestion: ${target.workspaceTitle} → ${target.sectionTitle} (${Math.round(target.confidence * 100)}%)`
    );

    // ── Step 5: Verify Preview works on our item ───────────────────────────
    const itemCard = page.locator('div').filter({
      has: page.getByRole('heading', { name: TEST_NOTE_TITLE, exact: true }),
    });

    // The first Preview button within our item's card
    const previewBtn = itemCard.getByRole('button', { name: 'Preview' }).first();
    await expect(previewBtn).toBeVisible();
    await previewBtn.click();

    // Preview content should appear
    const previewArea = itemCard.locator('.font-mono').first();
    await expect(previewArea).toBeVisible({ timeout: 3_000 });
    const previewText = await previewArea.textContent();
    expect(previewText?.length).toBeGreaterThan(10);
    console.log(`Preview shows ${previewText?.length} chars`);

    // Close preview
    await itemCard.getByRole('button', { name: 'Hide' }).first().click();

    // ── Step 6: Record version count before approve ────────────────────────
    const versionsRes = await page.request.get(
      `/api/workspaces/${target.workspaceId}/sections/${target.sectionId}/versions`
    );
    const versionsBefore = await versionsRes.json();
    const versionCountBefore = Array.isArray(versionsBefore) ? versionsBefore.length : 0;
    console.log(`Versions before: ${versionCountBefore}`);

    // ── Step 7: Approve the first suggestion ───────────────────────────────
    const approveBtn = itemCard.getByRole('button', { name: 'Approve' }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Wait for approve to complete
    await page.waitForTimeout(2_000);
    console.log('Approve clicked');

    // ── Step 7b: Verify item is now approved with approvedResults ─────────
    const approvedRes = await page.request.get('/api/inbox');
    const approvedItems = await approvedRes.json();
    const approvedItem = approvedItems.find((i: { title: string }) => i.title === TEST_NOTE_TITLE);
    expect(approvedItem).toBeTruthy();
    expect(approvedItem.status).toBe('approved');
    expect(approvedItem.approvedResults).toBeTruthy();
    expect(approvedItem.approvedResults.length).toBe(1);
    expect(approvedItem.approvedResults[0].workspaceTitle).toBe(target.workspaceTitle);
    expect(approvedItem.approvedResults[0].sectionTitle).toBe(target.sectionTitle);
    expect(approvedItem.approvedResults[0].workspaceSlug).toBeTruthy();
    console.log(
      `Item approved → ${approvedItem.approvedResults[0].workspaceTitle} → ${approvedItem.approvedResults[0].sectionTitle}`
    );

    // ── Step 8: Verify new version was created ─────────────────────────────
    const versionsResAfter = await page.request.get(
      `/api/workspaces/${target.workspaceId}/sections/${target.sectionId}/versions`
    );
    const versionsAfter = await versionsResAfter.json();
    const versionCountAfter = Array.isArray(versionsAfter) ? versionsAfter.length : 0;
    expect(versionCountAfter).toBe(versionCountBefore + 1);
    console.log(`Versions after: ${versionCountAfter}`);

    // Verify metadata on the new version
    const latestVersion = versionsAfter[0];
    expect(latestVersion.changeSource).toBe('ai_ingest');
    expect(latestVersion.changeDescription).toContain(TEST_NOTE_TITLE);
    expect(latestVersion.content.length).toBeGreaterThan(20);
    console.log(
      `New version: source=${latestVersion.changeSource}, ${latestVersion.content.length} chars`
    );

    // ── Step 9: Navigate to workspace and verify section has content ────────
    const workspaceRes = await page.request.get(`/api/workspaces/${target.workspaceId}`);
    const workspace = await workspaceRes.json();

    await page.goto(`/workspaces/${workspace.slug}`);
    await page.waitForLoadState('networkidle');

    // The target section should have content (not show empty placeholder)
    const sectionHeading = page.getByRole('heading', { name: target.sectionTitle });
    await expect(sectionHeading).toBeVisible({ timeout: 5_000 });

    // Verify no "empty" message is shown for this section
    const sectionContainer = sectionHeading.locator('..').locator('..');
    const emptyMessages = [
      'No content yet',
      'No cards yet',
      'No table data yet',
      'No checklist items yet',
      'No data yet',
    ];
    for (const msg of emptyMessages) {
      const emptyEl = sectionContainer.getByText(msg);
      const visible = await emptyEl.isVisible().catch(() => false);
      expect(visible, `"${msg}" should not be visible in "${target.sectionTitle}"`).toBe(false);
    }
    console.log(`Workspace section "${target.sectionTitle}" has content`);

    // ── Step 10: Check version history shows AI Ingest ──────────────────────
    const historyBtn = sectionContainer.getByRole('button', { name: 'History' });
    if (await historyBtn.isVisible().catch(() => false)) {
      await historyBtn.click();
      await expect(page.getByText('AI Ingest').first()).toBeVisible({ timeout: 5_000 });
      console.log('Version history shows AI Ingest badge');
    }

    console.log('PASS: Full inbox workflow verified end-to-end');
  });

  test('dismiss removes item from active list', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const dismissTitle = `Dismiss Test ${Date.now()}`;
    await page.getByPlaceholder('Note title').fill(dismissTitle);
    await page
      .getByPlaceholder('Paste or type your notes here...')
      .fill(
        'Short test note about AI consulting services and pricing strategies for enterprise clients.'
      );
    await page.getByRole('button', { name: 'Add Note' }).click();

    // Wait for item to appear
    await expect(page.getByRole('heading', { name: dismissTitle })).toBeVisible({ timeout: 5_000 });

    // Wait for routing to complete
    await expect(async () => {
      const res = await page.request.get('/api/inbox');
      const items = await res.json();
      const item = items.find((i: { title: string }) => i.title === dismissTitle);
      expect(item?.status).toBe('routed');
    }).toPass({ timeout: 60_000 });

    // Refresh to get routed state in UI
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Find our item and click dismiss (X button)
    const itemCard = page.locator('div').filter({
      has: page.getByRole('heading', { name: dismissTitle, exact: true }),
    });
    const dismissBtn = itemCard
      .locator('button')
      .filter({ has: page.locator('svg.lucide-x') })
      .first();
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    await page.waitForTimeout(1_000);

    // Verify via API
    const res = await page.request.get('/api/inbox');
    const items = await res.json();
    const dismissed = items.find((i: { title: string }) => i.title === dismissTitle);
    expect(dismissed).toBeTruthy();
    expect(dismissed.status).toBe('dismissed');
    console.log('PASS: Item dismissed successfully');
  });
});
