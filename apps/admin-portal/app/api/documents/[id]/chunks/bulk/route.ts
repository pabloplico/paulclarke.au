import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments } from '@/lib/db/schema';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { chunkIds: number[]; curationStatus: string };
  const { chunkIds, curationStatus } = body;

  if (!curationStatus || !Array.isArray(chunkIds) || chunkIds.length === 0) {
    return NextResponse.json(
      { error: 'chunkIds array and curationStatus are required' },
      { status: 400 }
    );
  }

  const updated = await db
    .update(adminDocumentChunks)
    .set({
      curationStatus,
      reviewedAt: new Date(),
    })
    .where(inArray(adminDocumentChunks.id, chunkIds))
    .returning({ id: adminDocumentChunks.id });

  return NextResponse.json({ updated: updated.length });
}
