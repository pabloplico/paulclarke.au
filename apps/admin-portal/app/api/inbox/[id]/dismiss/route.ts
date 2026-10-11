import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminInboxItems } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [item] = await db
    .select()
    .from(adminInboxItems)
    .where(and(eq(adminInboxItems.id, Number(id)), eq(adminInboxItems.userId, user.id)));

  if (!item) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
  }

  await db
    .update(adminInboxItems)
    .set({ status: 'dismissed', processedAt: new Date() })
    .where(eq(adminInboxItems.id, item.id));

  return NextResponse.json({ success: true });
}
