import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';
import { validateFileUpload } from '@/lib/document-processing/upload-validation';
import { storage } from '@/lib/storage';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const conditions = [eq(adminInboxItems.userId, user.id)];
  if (status) {
    conditions.push(eq(adminInboxItems.status, status));
  }

  const rows = await db
    .select({
      item: adminInboxItems,
      documentStatus: adminDocuments.status,
      documentError: adminDocuments.processingError,
    })
    .from(adminInboxItems)
    .leftJoin(adminDocuments, eq(adminInboxItems.documentId, adminDocuments.id))
    .where(and(...conditions))
    .orderBy(desc(adminInboxItems.createdAt));

  const items = rows.map((r) => ({
    ...r.item,
    documentStatus: r.documentStatus,
    documentError: r.documentError,
  }));

  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  await requireAiAllowance(user);
  const contentType = request.headers.get('content-type') ?? '';

  // Handle file uploads
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Validate before reading file contents into memory
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const safeFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = await storage.save(safeFilename, buffer);

    // Create document record
    const [doc] = await db
      .insert(adminDocuments)
      .values({
        title: file.name,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        filePath,
        fileSize: buffer.length,
        status: 'uploaded',
        source: 'inbox',
        userId: user.id,
      })
      .returning();

    if (!doc) {
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
    }

    // Create inbox item linked to document
    const [item] = await db
      .insert(adminInboxItems)
      .values({
        type: 'file',
        title: file.name,
        documentId: doc.id,
        status: 'pending',
        userId: user.id,
      })
      .returning();

    // Queue document processing (routing happens after processing completes)
    await queueDocument(doc.id);

    return NextResponse.json(item, { status: 202 });
  }

  // Handle JSON (URL or note)
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { type: string; title: string; content: string };
  const { type, title, content } = body;

  if (!type || !title?.trim()) {
    return NextResponse.json({ error: 'Type and title are required' }, { status: 400 });
  }

  if (type === 'url' && !content?.trim()) {
    return NextResponse.json({ error: 'URL content is required' }, { status: 400 });
  }

  if (type === 'note' && !content?.trim()) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
  }

  const trimmedContent = content.trim();

  // For URLs, strip tracking params from the title and truncate to fit varchar(500)
  const docTitle = title.trim().slice(0, 500);

  // Create document record so URLs/notes get chunked, embedded, and become searchable via RAG
  const [doc] = await db
    .insert(adminDocuments)
    .values({
      title: docTitle,
      filename: type === 'url' ? 'url-content.txt' : 'note.txt',
      mimeType: 'text/plain',
      filePath: '',
      fileSize: Buffer.byteLength(trimmedContent),
      status: 'uploaded',
      source: type, // 'url' or 'note'
      sourceUrl: type === 'url' ? trimmedContent : null,
      rawText: type === 'note' ? trimmedContent : null,
      userId: user.id,
    })
    .returning();

  if (!doc) {
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }

  const [item] = await db
    .insert(adminInboxItems)
    .values({
      type,
      title: title.trim(),
      content: trimmedContent,
      documentId: doc.id,
      status: 'pending',
      userId: user.id,
    })
    .returning();

  if (!item) {
    return NextResponse.json({ error: 'Failed to create inbox item' }, { status: 500 });
  }

  // Queue full document processing (clean → chunk → embed → metadata → routing)
  await queueDocument(doc.id);

  return NextResponse.json(item, { status: 202 });
}
