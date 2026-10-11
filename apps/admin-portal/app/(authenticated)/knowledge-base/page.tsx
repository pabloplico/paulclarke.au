import { count, countDistinct, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocumentChunks, adminKbChunks, adminKnowledgeBases } from '@/lib/db/schema';
import type { KnowledgeBaseWithStats } from '@/lib/types';
import { KnowledgeBaseView } from './knowledge-base-view';

export const dynamic = 'force-dynamic';

export default async function KnowledgeBasePage() {
  const user = await requireAuth();

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

  const enriched: KnowledgeBaseWithStats[] = knowledgeBases.map((kb) => ({
    ...kb,
    chunkCount: statsMap.get(kb.id)?.chunkCount ?? 0,
    documentCount: statsMap.get(kb.id)?.documentCount ?? 0,
  }));

  return (
    <div className="space-y-6">
      <KnowledgeBaseView initialKnowledgeBases={enriched} />
    </div>
  );
}
