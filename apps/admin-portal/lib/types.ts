import type { adminDocumentChunks, adminKnowledgeBases } from './db/schema';

export type CurationStatus = 'raw' | 'approved' | 'excluded' | 'parked';

export type KnowledgeBase = typeof adminKnowledgeBases.$inferSelect;

export type KnowledgeBaseWithStats = KnowledgeBase & {
  chunkCount: number;
  documentCount: number;
};

export type Chunk = typeof adminDocumentChunks.$inferSelect;

export type ChunkWithCuration = Chunk & {
  kbAssignments: { id: number; knowledgeBaseId: number; name: string; color: string | null }[];
};

export type DocumentReviewStats = {
  raw: number;
  approved: number;
  excluded: number;
  parked: number;
  total: number;
};
