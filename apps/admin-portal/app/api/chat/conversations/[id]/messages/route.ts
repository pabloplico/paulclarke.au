import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminConversations, adminMessages } from '@/lib/db/schema';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [conversation] = await db
    .select({
      id: adminConversations.id,
      title: adminConversations.title,
      scope: adminConversations.scope,
      createdAt: adminConversations.createdAt,
      updatedAt: adminConversations.updatedAt,
    })
    .from(adminConversations)
    .where(and(eq(adminConversations.id, Number(id)), eq(adminConversations.userId, user.id)));

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await db
    .select({
      id: adminMessages.id,
      role: adminMessages.role,
      content: adminMessages.content,
      sources: adminMessages.sources,
      createdAt: adminMessages.createdAt,
    })
    .from(adminMessages)
    .where(eq(adminMessages.conversationId, Number(id)))
    .orderBy(asc(adminMessages.createdAt));

  return NextResponse.json({ conversation, messages });
}
