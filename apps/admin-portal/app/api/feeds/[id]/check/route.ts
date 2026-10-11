import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminFeeds } from '@/lib/db/schema';
import { fetchFeed } from '@/lib/feeds/fetcher';
import { ingestFeedItems } from '@/lib/feeds/ingest';
import type { FeedConfig } from '@/lib/feeds/types';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const feedId = Number.parseInt(id, 10);

  if (Number.isNaN(feedId)) {
    return NextResponse.json({ error: 'Invalid feed ID' }, { status: 400 });
  }

  const [feed] = await db
    .select()
    .from(adminFeeds)
    .where(and(eq(adminFeeds.id, feedId), eq(adminFeeds.userId, user.id)))
    .limit(1);

  if (!feed) {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }

  const feedConfig: FeedConfig = {
    id: feed.id,
    userId: feed.userId,
    url: feed.url,
    type: feed.type as FeedConfig['type'],
    workspaceId: feed.workspaceId,
    lastFetchedAt: feed.lastFetchedAt,
    lastContentHash: feed.lastContentHash,
  };

  try {
    const { items, contentHash } = await fetchFeed(feedConfig);
    const newItems = await ingestFeedItems(feedConfig, items);

    await db
      .update(adminFeeds)
      .set({
        lastFetchedAt: new Date(),
        lastContentHash: contentHash,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(adminFeeds.id, feedId));

    return NextResponse.json({ newItems });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await db
      .update(adminFeeds)
      .set({
        lastFetchedAt: new Date(),
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(adminFeeds.id, feedId));

    return NextResponse.json({ error: errorMessage, newItems: 0 }, { status: 502 });
  }
}
