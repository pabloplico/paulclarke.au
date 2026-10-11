import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { storage } from '@/lib/storage';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  const [doc] = await db
    .select()
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const chunks = await db
    .select({ id: adminDocumentChunks.id, chunkIndex: adminDocumentChunks.chunkIndex })
    .from(adminDocumentChunks)
    .where(eq(adminDocumentChunks.documentId, documentId));

  return NextResponse.json({
    ...doc,
    chunkCount: chunks.length,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  const [doc] = await db
    .select()
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Nullify inbox item references (FK has no cascade)
  await db
    .update(adminInboxItems)
    .set({ documentId: null })
    .where(eq(adminInboxItems.documentId, documentId));

  // Delete document (chunks + section sources cascade via FK)
  await db.delete(adminDocuments).where(eq(adminDocuments.id, documentId));

  // Remove file from storage last (after DB succeeds, ignore if already missing)
  try {
    await storage.remove(doc.filePath);
  } catch {
    // File may already be deleted
  }

  return NextResponse.json({ message: 'Document deleted' });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  // Verify ownership
  const [doc] = await db
    .select({ id: adminDocuments.id })
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { archived?: boolean };

  if ('archived' in body) {
    const archivedAt = body.archived ? new Date() : null;
    const [updated] = await db
      .update(adminDocuments)
      .set({ archivedAt, updatedAt: new Date() })
      .where(eq(adminDocuments.id, documentId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
}
