import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments } from '@/lib/db/schema';

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { documentIds?: number[] };
  const { documentIds } = body;

  const conditions = [eq(adminDocuments.userId, user.id)];
  if (documentIds?.length) {
    conditions.push(inArray(adminDocuments.id, documentIds));
  }

  const docs = await db
    .select()
    .from(adminDocuments)
    .where(and(...conditions));

  // Fetch chunks for each document
  const allChunks =
    docs.length > 0
      ? await db
          .select({
            id: adminDocumentChunks.id,
            documentId: adminDocumentChunks.documentId,
            chunkIndex: adminDocumentChunks.chunkIndex,
            content: adminDocumentChunks.content,
            tokenCount: adminDocumentChunks.tokenCount,
            metadata: adminDocumentChunks.metadata,
            curationStatus: adminDocumentChunks.curationStatus,
            curatorNote: adminDocumentChunks.curatorNote,
          })
          .from(adminDocumentChunks)
          .where(
            inArray(
              adminDocumentChunks.documentId,
              docs.map((d) => d.id)
            )
          )
      : [];

  const chunksByDoc = new Map<number, typeof allChunks>();
  for (const chunk of allChunks) {
    const arr = chunksByDoc.get(chunk.documentId) ?? [];
    arr.push(chunk);
    chunksByDoc.set(chunk.documentId, arr);
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    documentCount: docs.length,
    documents: docs.map((doc) => ({
      ...doc,
      chunks: chunksByDoc.get(doc.id) ?? [],
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="documents-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
