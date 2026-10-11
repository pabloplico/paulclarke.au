import { count, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminFeedItems, adminFeeds, adminWorkspaces } from '@/lib/db/schema';

export async function GET() {
  const user = await requireAuthApi();

  const feeds = await db
    .select({
      id: adminFeeds.id,
      userId: adminFeeds.userId,
      url: adminFeeds.url,
      type: adminFeeds.type,
      label: adminFeeds.label,
      workspaceId: adminFeeds.workspaceId,
      enabled: adminFeeds.enabled,
      intervalMinutes: adminFeeds.intervalMinutes,
      lastFetchedAt: adminFeeds.lastFetchedAt,
      lastContentHash: adminFeeds.lastContentHash,
      lastError: adminFeeds.lastError,
      createdAt: adminFeeds.createdAt,
      updatedAt: adminFeeds.updatedAt,
      itemCount: count(adminFeedItems.id),
    })
    .from(adminFeeds)
    .leftJoin(adminFeedItems, eq(adminFeeds.id, adminFeedItems.feedId))
    .where(eq(adminFeeds.userId, user.id))
    .groupBy(adminFeeds.id)
    .orderBy(desc(adminFeeds.createdAt));

  return NextResponse.json(feeds);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    url: string;
    type: string;
    label?: string;
    workspaceId?: number;
    intervalMinutes?: number;
  };
  const { url, type, label, workspaceId, intervalMinutes } = body;

  if (!url?.trim()) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  if (type !== 'rss' && type !== 'page') {
    return NextResponse.json({ error: 'Type must be "rss" or "page"' }, { status: 400 });
  }

  // Verify workspace ownership if provided
  if (workspaceId) {
    const [workspace] = await db
      .select({ id: adminWorkspaces.id, userId: adminWorkspaces.userId })
      .from(adminWorkspaces)
      .where(eq(adminWorkspaces.id, workspaceId))
      .limit(1);

    if (!workspace || workspace.userId !== user.id) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
  }

  const [created] = await db
    .insert(adminFeeds)
    .values({
      userId: user.id,
      url: url.trim(),
      type,
      label: label?.trim() || null,
      workspaceId: workspaceId || null,
      intervalMinutes: intervalMinutes ?? 60,
    })
    .returning();

  if (!created) {
    return NextResponse.json({ error: 'Failed to create feed' }, { status: 500 });
  }

  return NextResponse.json(created, { status: 201 });
}
