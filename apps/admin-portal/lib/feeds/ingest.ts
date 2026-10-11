import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  adminDocuments,
  adminFeedItems,
  adminGapReports,
  adminInboxItems,
  type GapFinding,
} from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';
import type { FeedConfig, RssItem } from './types';

/**
 * Ingest feed items into the inbox pipeline.
 * Skips duplicates by checking `(feedId, guid)` in admin_feed_items.
 * Returns the count of newly ingested items.
 */
export async function ingestFeedItems(feed: FeedConfig, items: RssItem[]): Promise<number> {
  if (items.length === 0) return 0;

  // Collect guids to check for existing entries
  const guids = items.map((item) => item.guid);

  const existing = await db
    .select({ guid: adminFeedItems.guid })
    .from(adminFeedItems)
    .where(and(eq(adminFeedItems.feedId, feed.id), inArray(adminFeedItems.guid, guids)));

  const existingGuids = new Set(existing.map((row) => row.guid));
  const newItems = items.filter((item) => !existingGuids.has(item.guid));

  // Load gap report for keyword matching if feed has a target workspace
  let gapReport: { id: number; findings: GapFinding[] } | undefined;
  if (feed.workspaceId) {
    const [report] = await db
      .select({ id: adminGapReports.id, findings: adminGapReports.findings })
      .from(adminGapReports)
      .where(eq(adminGapReports.workspaceId, feed.workspaceId))
      .orderBy(desc(adminGapReports.createdAt))
      .limit(1);
    if (report) gapReport = report;
  }

  let ingested = 0;

  for (const item of newItems) {
    const contentHash = createHash('sha256').update(item.content).digest('hex');

    // Check if feed item content matches any gap finding keywords
    const gapRef =
      gapReport && feed.workspaceId ? matchGapFinding(gapReport, feed.workspaceId, item) : null;

    // 1. Create document record
    const [doc] = await db
      .insert(adminDocuments)
      .values({
        userId: feed.userId,
        title: item.title || 'Feed Item',
        filename: 'feed-item.txt',
        mimeType: 'text/plain',
        filePath: '',
        fileSize: Buffer.byteLength(item.content, 'utf8'),
        status: 'uploaded',
        source: 'feed',
        sourceUrl: item.link || null,
        rawText: item.content,
      })
      .returning({ id: adminDocuments.id });

    if (!doc) continue;

    // 2. Create inbox item (with gapFindingRef if matched)
    const [inbox] = await db
      .insert(adminInboxItems)
      .values({
        userId: feed.userId,
        type: 'feed',
        title: item.title || 'Feed Item',
        content: item.content,
        documentId: doc.id,
        status: 'pending',
        gapFindingRef: gapRef,
      })
      .returning({ id: adminInboxItems.id });

    if (!inbox) continue;

    // 3. Track feed item for deduplication
    await db.insert(adminFeedItems).values({
      feedId: feed.id,
      guid: item.guid,
      title: item.title || null,
      url: item.link || null,
      contentHash,
      inboxItemId: inbox.id,
    });

    // 4. Queue document for processing pipeline
    await queueDocument(doc.id);

    ingested++;
  }

  return ingested;
}

/**
 * Simple keyword matching: check if feed item title/content contains
 * significant words from any gap finding's issue description.
 */
function matchGapFinding(
  report: { id: number; findings: GapFinding[] },
  workspaceId: number,
  item: RssItem
): { gapReportId: number; findingIndex: number; workspaceId: number } | null {
  const text = `${item.title} ${item.content}`.toLowerCase();

  for (const [i, finding] of report.findings.entries()) {
    // Extract significant words (4+ chars) from the issue
    const words = finding.issue
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4);

    // Require at least 2 keyword matches to reduce false positives
    const matches = words.filter((w) => text.includes(w));
    if (matches.length >= 2) {
      return { gapReportId: report.id, findingIndex: i, workspaceId };
    }
  }

  return null;
}
