import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { generateEmbedding } from '@/lib/rag/embeddings';
import { searchAllDocuments } from '@/lib/rag/search';

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { text: string };
  const { text } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const queryText = text.trim().slice(0, 2000);

  try {
    const embedding = await generateEmbedding(queryText);
    const results = await searchAllDocuments(user.id, embedding, 5, 0.3);

    // Group by document and pick best chunk per document
    const byDocument = new Map<
      number,
      {
        documentId: number;
        documentTitle: string;
        bestScore: number;
        chunks: {
          chunkId: number;
          content: string;
          score: number;
          chunkIndex: number;
          pageRange?: string;
          sectionHeading?: string;
        }[];
      }
    >();

    for (const r of results) {
      const meta = r.metadata ?? {};
      const chunk = {
        chunkId: r.chunkId,
        content: r.content.slice(0, 300),
        score: r.score,
        chunkIndex: r.chunkIndex,
        pageRange: (meta.pageRange as string) ?? undefined,
        sectionHeading: (meta.sectionHeading as string) ?? undefined,
      };

      const existing = byDocument.get(r.documentId);
      if (existing) {
        existing.chunks.push(chunk);
        if (r.score > existing.bestScore) existing.bestScore = r.score;
      } else {
        byDocument.set(r.documentId, {
          documentId: r.documentId,
          documentTitle: r.documentTitle,
          bestScore: r.score,
          chunks: [chunk],
        });
      }
    }

    // Sort documents by best score descending
    const sources = Array.from(byDocument.values()).sort((a, b) => b.bestScore - a.bestScore);

    return NextResponse.json({
      sources,
      hasResults: sources.length > 0,
      query: queryText.slice(0, 100),
    });
  } catch (error) {
    console.error('Find source failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
