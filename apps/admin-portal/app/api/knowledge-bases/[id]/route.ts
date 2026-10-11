import { and, count, countDistinct, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminKbChunks, adminKnowledgeBases } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

async function getKbWithStats(id: number, userId: number) {
  const [kb] = await db
    .select()
    .from(adminKnowledgeBases)
    .where(and(eq(adminKnowledgeBases.id, id), eq(adminKnowledgeBases.userId, userId)));

  if (!kb) return null;

  const [stats] = await db
    .select({
      chunkCount: count(adminKbChunks.chunkId),
      documentCount: countDistinct(adminDocumentChunks.documentId),
    })
    .from(adminKbChunks)
    .innerJoin(adminDocumentChunks, eq(adminKbChunks.chunkId, adminDocumentChunks.id))
    .where(eq(adminKbChunks.knowledgeBaseId, id));

  return {
    ...kb,
    chunkCount: stats?.chunkCount ?? 0,
    documentCount: stats?.documentCount ?? 0,
  };
}

export async function GET(_request: Request, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const kbId = Number(id);

  if (Number.isNaN(kbId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const kb = await getKbWithStats(kbId, user.id);
  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  return NextResponse.json(kb);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const kbId = Number(id);

  if (Number.isNaN(kbId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  // Verify ownership
  const [existing] = await db
    .select({ id: adminKnowledgeBases.id })
    .from(adminKnowledgeBases)
    .where(and(eq(adminKnowledgeBases.id, kbId), eq(adminKnowledgeBases.userId, user.id)));

  if (!existing) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { name?: string; description?: string; color?: string };
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.color !== undefined) updates.color = body.color || null;

  await db.update(adminKnowledgeBases).set(updates).where(eq(adminKnowledgeBases.id, kbId));

  const kb = await getKbWithStats(kbId, user.id);
  return NextResponse.json(kb);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const kbId = Number(id);

  if (Number.isNaN(kbId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const [deleted] = await db
    .delete(adminKnowledgeBases)
    .where(and(eq(adminKnowledgeBases.id, kbId), eq(adminKnowledgeBases.userId, user.id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Knowledge base deleted' });
}
