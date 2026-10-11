import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminInboxItems, type RoutingSuggestion } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { suggestionIndex: number };
  const { suggestionIndex } = body;

  const [item] = await db
    .select()
    .from(adminInboxItems)
    .where(and(eq(adminInboxItems.id, Number(id)), eq(adminInboxItems.userId, user.id)));

  if (!item) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
  }

  if (item.status !== 'routed') {
    return NextResponse.json({ error: 'Item has no routing results' }, { status: 400 });
  }

  const suggestions = item.routingResults as RoutingSuggestion[] | null;
  if (!suggestions || suggestionIndex >= suggestions.length || suggestionIndex < 0) {
    return NextResponse.json({ error: 'Invalid suggestion index' }, { status: 400 });
  }

  const remaining = suggestions.filter((_, i) => i !== suggestionIndex);
  const hasApproved = (item.approvedResults as unknown[] | null)?.length ?? 0;

  await db
    .update(adminInboxItems)
    .set({
      routingResults: remaining.length > 0 ? remaining : null,
      // If no suggestions left and some were approved, mark as approved
      // If no suggestions left and none approved, mark as dismissed
      status: remaining.length > 0 ? 'routed' : hasApproved > 0 ? 'approved' : 'dismissed',
    })
    .where(eq(adminInboxItems.id, item.id));

  return NextResponse.json({ remaining: remaining.length });
}
