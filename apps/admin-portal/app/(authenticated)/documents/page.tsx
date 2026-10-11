import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminDocuments, adminKnowledgeBases } from '@/lib/db/schema';
import type { DocumentReviewStats, KnowledgeBaseWithStats } from '@/lib/types';
import { DocumentsView } from './documents-view';

export const dynamic = 'force-dynamic';

export type DocumentWithChunks = typeof adminDocuments.$inferSelect & {
  chunkCount: number;
  reviewStats: DocumentReviewStats;
};

export default async function DocumentsPage() {
  const user = await requireAuth();

  const documents = await db
    .select()
    .from(adminDocuments)
    .where(and(eq(adminDocuments.userId, user.id), isNull(adminDocuments.archivedAt)))
    .orderBy(desc(adminDocuments.createdAt));

  // Get chunk counts + curation status per document
  const chunkStats = await db
    .select({
      documentId: adminDocumentChunks.documentId,
      curationStatus: adminDocumentChunks.curationStatus,
      count: count(),
    })
    .from(adminDocumentChunks)
    .groupBy(adminDocumentChunks.documentId, adminDocumentChunks.curationStatus);

  const statsMap = new Map<number, DocumentReviewStats>();
  for (const row of chunkStats) {
    const existing = statsMap.get(row.documentId) || {
      raw: 0,
      approved: 0,
      excluded: 0,
      parked: 0,
      total: 0,
    };
    const status = row.curationStatus as keyof Omit<DocumentReviewStats, 'total'>;
    if (status in existing) existing[status] = row.count;
    existing.total += row.count;
    statsMap.set(row.documentId, existing);
  }

  const enriched: DocumentWithChunks[] = documents.map((doc) => ({
    ...doc,
    chunkCount: statsMap.get(doc.id)?.total ?? 0,
    reviewStats: statsMap.get(doc.id) ?? { raw: 0, approved: 0, excluded: 0, parked: 0, total: 0 },
  }));

  // Fetch knowledge bases for filter dropdown
  const knowledgeBases = (
    await db.select().from(adminKnowledgeBases).where(eq(adminKnowledgeBases.userId, user.id))
  ).map((kb) => ({ ...kb, chunkCount: 0, documentCount: 0 }) as KnowledgeBaseWithStats);

  return (
    <div className="space-y-6">
      <DocumentsView initialDocuments={enriched} knowledgeBases={knowledgeBases} />
    </div>
  );
}
