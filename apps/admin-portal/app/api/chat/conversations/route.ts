import { and, desc, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminConversations } from '@/lib/db/schema';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);

  const scopeType = searchParams.get('scope_type');
  const scopeId = searchParams.get('scope_id');
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100);

  const conditions = [eq(adminConversations.userId, user.id)];

  if (scopeType === 'workspace' && scopeId) {
    conditions.push(eq(adminConversations.workspaceId, Number(scopeId)));
  } else if (scopeType === 'kb' && scopeId) {
    conditions.push(eq(adminConversations.knowledgeBaseId, Number(scopeId)));
  } else if (scopeType === 'general') {
    conditions.push(isNull(adminConversations.workspaceId));
    conditions.push(isNull(adminConversations.knowledgeBaseId));
  }

  const conversations = await db
    .select({
      id: adminConversations.id,
      title: adminConversations.title,
      scope: adminConversations.scope,
      createdAt: adminConversations.createdAt,
      updatedAt: adminConversations.updatedAt,
    })
    .from(adminConversations)
    .where(and(...conditions))
    .orderBy(desc(adminConversations.updatedAt))
    .limit(limit);

  return NextResponse.json(conversations);
}
