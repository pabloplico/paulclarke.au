import { generateText } from 'ai';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getModel } from '@/lib/ai/models';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminDocuments } from '@/lib/db/schema';
import { cleanText } from '@/lib/document-processing/cleaner';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const documentId = Number(id);

  if (Number.isNaN(documentId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { mode: string };
  const mode = body.mode;

  const [doc] = await db
    .select()
    .from(adminDocuments)
    .where(and(eq(adminDocuments.id, documentId), eq(adminDocuments.userId, user.id)));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (mode === 'reclean') {
    if (!doc.rawText) {
      return NextResponse.json({ error: 'No raw text available to re-clean' }, { status: 400 });
    }

    const cleaned = cleanText(doc.rawText);
    await db
      .update(adminDocuments)
      .set({ cleanedText: cleaned, updatedAt: new Date() })
      .where(eq(adminDocuments.id, documentId));

    return NextResponse.json({ message: 'Text re-cleaned successfully' });
  }

  if (mode === 'ai-cleanup') {
    const sourceText = doc.cleanedText || doc.rawText;
    if (!sourceText) {
      return NextResponse.json({ error: 'No text available to clean up' }, { status: 400 });
    }

    const cfg = await loadConfig();
    const result = await generateText({
      model: getModel(cfg),
      system:
        'You are a document formatting specialist. Rewrite the following text into clean, well-structured markdown. Fix formatting issues, improve heading structure, clean up artifacts from PDF/document extraction, and ensure consistent formatting. Preserve all factual content exactly. Output ONLY the cleaned markdown, no explanations.',
      messages: [{ role: 'user', content: sourceText }],
    });

    await db
      .update(adminDocuments)
      .set({ cleanedText: result.text, updatedAt: new Date() })
      .where(eq(adminDocuments.id, documentId));

    return NextResponse.json({ message: 'AI cleanup complete' });
  }

  return NextResponse.json(
    { error: 'Invalid mode. Use "reclean" or "ai-cleanup"' },
    { status: 400 }
  );
}
