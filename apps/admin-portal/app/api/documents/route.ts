import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments, adminKbDocuments } from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';
import { storage } from '@/lib/storage';

function parseUserTags(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const documentType = searchParams.get('documentType');
  const knowledgeBaseId = searchParams.get('knowledgeBaseId');
  const showArchived = searchParams.get('archived') === 'true';

  const conditions = [eq(adminDocuments.userId, user.id)];
  if (showArchived) {
    conditions.push(isNotNull(adminDocuments.archivedAt));
  } else {
    conditions.push(isNull(adminDocuments.archivedAt));
  }
  if (status) {
    conditions.push(eq(adminDocuments.status, status));
  }
  if (documentType) {
    conditions.push(eq(adminDocuments.aiDocumentType, documentType));
  }

  let query = db.select().from(adminDocuments);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  let documents = await query;

  // Filter by KB if requested (via kb_documents join)
  if (knowledgeBaseId) {
    const kbDocs = await db
      .select({ documentId: adminKbDocuments.documentId })
      .from(adminKbDocuments)
      .where(eq(adminKbDocuments.knowledgeBaseId, Number(knowledgeBaseId)));
    const kbDocIds = new Set(kbDocs.map((d) => d.documentId));
    documents = documents.filter((d) => kbDocIds.has(d.id));
  }

  // Enrich with chunk counts + review stats (batch query to avoid N+1)
  const defaultStats = { raw: 0, approved: 0, excluded: 0, parked: 0, total: 0 };
  const chunkStatsMap = new Map<
    number,
    { raw: number; approved: number; excluded: number; parked: number; total: number }
  >();

  if (documents.length > 0) {
    const allChunks = await db
      .select({
        documentId: adminDocumentChunks.documentId,
        curationStatus: adminDocumentChunks.curationStatus,
      })
      .from(adminDocumentChunks)
      .where(
        inArray(
          adminDocumentChunks.documentId,
          documents.map((d) => d.id)
        )
      );

    for (const chunk of allChunks) {
      let stats = chunkStatsMap.get(chunk.documentId);
      if (!stats) {
        stats = { raw: 0, approved: 0, excluded: 0, parked: 0, total: 0 };
        chunkStatsMap.set(chunk.documentId, stats);
      }
      stats.total++;
      if (chunk.curationStatus === 'raw') stats.raw++;
      else if (chunk.curationStatus === 'approved') stats.approved++;
      else if (chunk.curationStatus === 'excluded') stats.excluded++;
      else if (chunk.curationStatus === 'parked') stats.parked++;
    }
  }

  const enriched = documents.map((doc) => {
    const reviewStats = chunkStatsMap.get(doc.id) ?? { ...defaultStats };
    return { ...doc, chunkCount: reviewStats.total, reviewStats };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const timestamp = Date.now();
  const safeFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = await storage.save(safeFilename, buffer);

  // Optional fields from form data
  const clientId = formData.get('clientId');
  const userTags = formData.get('userTags');
  const source = formData.get('source')?.toString() || 'upload';

  const [created] = await db
    .insert(adminDocuments)
    .values({
      title: formData.get('title')?.toString() || file.name,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      filePath,
      fileSize: buffer.length,
      status: 'uploaded',
      source,
      clientId: clientId ? Number(clientId) : null,
      userTags: userTags ? parseUserTags(userTags.toString()) : null,
      userId: user.id,
    })
    .returning();

  if (!created) {
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }

  // Enqueue for async processing
  await queueDocument(created.id);

  return NextResponse.json(created, { status: 202 });
}
