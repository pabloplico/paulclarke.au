import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminFeedItems, adminFeeds, adminWorkspaces } from '@/lib/db/schema';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const items = await db
    .select()
    .from(adminFeedItems)
    .where(eq(adminFeedItems.feedId, feedId))
    .orderBy(desc(adminFeedItems.createdAt))
    .limit(20);

  return NextResponse.json({ ...feed, items });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const feedId = Number.parseInt(id, 10);

  if (Number.isNaN(feedId)) {
    return NextResponse.json({ error: 'Invalid feed ID' }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(adminFeeds)
    .where(and(eq(adminFeeds.id, feedId), eq(adminFeeds.userId, user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    label?: string;
    enabled?: boolean;
    intervalMinutes?: number;
    workspaceId?: number | null;
  };
  const updates: Record<string, unknown> = {};

  if (body.label !== undefined) updates.label = body.label?.trim() || null;
  if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);
  if (body.intervalMinutes !== undefined) updates.intervalMinutes = body.intervalMinutes;

  if (body.workspaceId !== undefined) {
    if (body.workspaceId) {
      const [ws] = await db
        .select({ id: adminWorkspaces.id, userId: adminWorkspaces.userId })
        .from(adminWorkspaces)
        .where(eq(adminWorkspaces.id, body.workspaceId))
        .limit(1);

      if (!ws || ws.userId !== user.id) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
    }
    updates.workspaceId = body.workspaceId || null;
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(adminFeeds)
    .set(updates)
    .where(eq(adminFeeds.id, feedId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const feedId = Number.parseInt(id, 10);

  if (Number.isNaN(feedId)) {
    return NextResponse.json({ error: 'Invalid feed ID' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: adminFeeds.id })
    .from(adminFeeds)
    .where(and(eq(adminFeeds.id, feedId), eq(adminFeeds.userId, user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }

  await db.delete(adminFeeds).where(eq(adminFeeds.id, feedId));

  return new NextResponse(null, { status: 204 });
}
