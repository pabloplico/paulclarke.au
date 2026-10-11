import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminKbChunks, adminKnowledgeBases } from '@/lib/db/schema';

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { knowledgeBaseId: number; chunkIds: number[] };
  const { knowledgeBaseId, chunkIds } = body;

  if (!knowledgeBaseId || !Array.isArray(chunkIds) || chunkIds.length === 0) {
    return NextResponse.json(
      { error: 'knowledgeBaseId and chunkIds array are required' },
      { status: 400 }
    );
  }

  // Verify KB ownership
  const [kb] = await db
    .select({ id: adminKnowledgeBases.id })
    .from(adminKnowledgeBases)
    .where(
      and(eq(adminKnowledgeBases.id, knowledgeBaseId), eq(adminKnowledgeBases.userId, user.id))
    );

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  const values = chunkIds.map((chunkId: number) => ({
    knowledgeBaseId,
    chunkId,
  }));

  const inserted = await db.insert(adminKbChunks).values(values).onConflictDoNothing().returning();

  return NextResponse.json({ added: inserted.length }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { knowledgeBaseId: number; chunkIds: number[] };
  const { knowledgeBaseId, chunkIds } = body;

  if (!knowledgeBaseId || !Array.isArray(chunkIds) || chunkIds.length === 0) {
    return NextResponse.json(
      { error: 'knowledgeBaseId and chunkIds array are required' },
      { status: 400 }
    );
  }

  // Verify KB ownership
  const [kb] = await db
    .select({ id: adminKnowledgeBases.id })
    .from(adminKnowledgeBases)
    .where(
      and(eq(adminKnowledgeBases.id, knowledgeBaseId), eq(adminKnowledgeBases.userId, user.id))
    );

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  const deleted = await db
    .delete(adminKbChunks)
    .where(
      and(
        eq(adminKbChunks.knowledgeBaseId, knowledgeBaseId),
        inArray(adminKbChunks.chunkId, chunkIds)
      )
    )
    .returning();

  return NextResponse.json({ removed: deleted.length });
}
