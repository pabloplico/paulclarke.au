import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  adminDocumentChunks,
  adminDocuments,
  adminKbChunks,
  adminKnowledgeBases,
} from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  // Verify document ownership
  const [doc] = await db
    .select({ id: adminDocuments.id })
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const chunks = await db
    .select({
      id: adminDocumentChunks.id,
      documentId: adminDocumentChunks.documentId,
      content: adminDocumentChunks.content,
      chunkIndex: adminDocumentChunks.chunkIndex,
      tokenCount: adminDocumentChunks.tokenCount,
      metadata: adminDocumentChunks.metadata,
      createdAt: adminDocumentChunks.createdAt,
      curationStatus: adminDocumentChunks.curationStatus,
      curatorNote: adminDocumentChunks.curatorNote,
      reviewedAt: adminDocumentChunks.reviewedAt,
    })
    .from(adminDocumentChunks)
    .where(eq(adminDocumentChunks.documentId, documentId))
    .orderBy(adminDocumentChunks.chunkIndex);

  // Get KB assignments for all chunks in one query
  const chunkIds = chunks.map((c) => c.id);
  let kbAssignments: {
    chunkId: number;
    knowledgeBaseId: number;
    name: string;
    color: string | null;
  }[] = [];

  if (chunkIds.length > 0) {
    kbAssignments = await db
      .select({
        chunkId: adminKbChunks.chunkId,
        knowledgeBaseId: adminKbChunks.knowledgeBaseId,
        name: adminKnowledgeBases.name,
        color: adminKnowledgeBases.color,
      })
      .from(adminKbChunks)
      .innerJoin(adminKnowledgeBases, eq(adminKbChunks.knowledgeBaseId, adminKnowledgeBases.id))
      .where(sql`${adminKbChunks.chunkId} IN ${chunkIds}`);
  }

  const assignmentsByChunk = new Map<number, typeof kbAssignments>();
  for (const a of kbAssignments) {
    const existing = assignmentsByChunk.get(a.chunkId) || [];
    existing.push(a);
    assignmentsByChunk.set(a.chunkId, existing);
  }

  const enriched = chunks.map((chunk) => ({
    ...chunk,
    kbAssignments: (assignmentsByChunk.get(chunk.id) || []).map((a) => ({
      id: a.knowledgeBaseId,
      knowledgeBaseId: a.knowledgeBaseId,
      name: a.name,
      color: a.color,
    })),
  }));

  return NextResponse.json(enriched);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  // Verify document ownership
  const [ownedDoc] = await db
    .select({ id: adminDocuments.id })
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!ownedDoc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { chunkId: number; curationStatus: string; curatorNote?: string };
  const { chunkId, curationStatus, curatorNote } = body;

  if (!chunkId || !curationStatus) {
    return NextResponse.json({ error: 'chunkId and curationStatus are required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    curationStatus,
    reviewedAt: new Date(),
  };
  if (curatorNote !== undefined) updates.curatorNote = curatorNote;

  const [updated] = await db
    .update(adminDocumentChunks)
    .set(updates)
    .where(and(eq(adminDocumentChunks.id, chunkId), eq(adminDocumentChunks.documentId, documentId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
