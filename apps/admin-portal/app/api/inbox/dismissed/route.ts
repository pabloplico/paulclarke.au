import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminInboxItems } from '@/lib/db/schema';

export async function DELETE() {
  const user = await requireAuthApi();

  const deleted = await db
    .delete(adminInboxItems)
    .where(and(eq(adminInboxItems.userId, user.id), eq(adminInboxItems.status, 'dismissed')))
    .returning({ id: adminInboxItems.id });

  return NextResponse.json({
    deleted: deleted.length,
    message: `${deleted.length} dismissed item${deleted.length === 1 ? '' : 's'} removed`,
  });
}
