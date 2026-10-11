import { count, countDistinct, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminKbChunks, adminKnowledgeBases } from '@/lib/db/schema';

export async function GET() {
  const user = await requireAuthApi();
  const knowledgeBases = await db
    .select()
    .from(adminKnowledgeBases)
    .where(eq(adminKnowledgeBases.userId, user.id));

  const stats = await db
    .select({
      knowledgeBaseId: adminKbChunks.knowledgeBaseId,
      chunkCount: count(adminKbChunks.chunkId),
      documentCount: countDistinct(adminDocumentChunks.documentId),
    })
    .from(adminKbChunks)
    .innerJoin(adminDocumentChunks, eq(adminKbChunks.chunkId, adminDocumentChunks.id))
    .groupBy(adminKbChunks.knowledgeBaseId);

  const statsMap = new Map(
    stats.map((s) => [
      s.knowledgeBaseId,
      { chunkCount: s.chunkCount, documentCount: s.documentCount },
    ])
  );

  const enriched = knowledgeBases.map((kb) => ({
    ...kb,
    chunkCount: statsMap.get(kb.id)?.chunkCount ?? 0,
    documentCount: statsMap.get(kb.id)?.documentCount ?? 0,
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { name: string; description?: string; color?: string };
  const { name, description, color } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminKnowledgeBases)
    .values({
      name: name.trim(),
      description: description || null,
      color: color || null,
      userId: user.id,
    })
    .returning();

  return NextResponse.json({ ...created, chunkCount: 0, documentCount: 0 }, { status: 201 });
}
