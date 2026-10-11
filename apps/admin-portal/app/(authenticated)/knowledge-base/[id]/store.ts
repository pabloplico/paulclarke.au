import { create } from 'zustand';
import type { KnowledgeBaseWithStats } from '@/lib/types';

export interface KbChunk {
  kbChunkId: number;
  addedAt: Date | string;
  chunkId: number;
  content: string;
  chunkIndex: number;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
  curationStatus: string;
  documentId: number;
  documentTitle: string;
}

export interface AvailableChunk {
  chunkId: number;
  content: string;
  chunkIndex: number;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
  documentId: number;
  documentTitle: string;
}

interface KbDetailStore {
  kb: KnowledgeBaseWithStats | null;
  chunks: KbChunk[];
  showPicker: boolean;
  search: string;

  setKb: (kb: KnowledgeBaseWithStats) => void;
  setChunks: (chunks: KbChunk[]) => void;
  removeChunks: (chunkIds: number[]) => void;
  togglePicker: () => void;
  setSearch: (search: string) => void;
}

export const useKbDetailStore = create<KbDetailStore>()((set) => ({
  kb: null,
  chunks: [],
  showPicker: false,
  search: '',

  setKb: (kb) => set({ kb }),
  setChunks: (chunks) => set({ chunks }),
  removeChunks: (chunkIds) =>
    set((state) => ({
      chunks: state.chunks.filter((c) => !chunkIds.includes(c.chunkId)),
    })),
  togglePicker: () => set((state) => ({ showPicker: !state.showPicker })),
  setSearch: (search) => set({ search }),
}));
