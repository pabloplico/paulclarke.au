import { create } from 'zustand';
import type { ChunkWithCuration, CurationStatus } from '@/lib/types';
import type { CurationFilter } from './utils';

interface ChunkReviewStore {
  chunks: ChunkWithCuration[];
  filter: CurationFilter;
  focusedIndex: number;

  setChunks: (chunks: ChunkWithCuration[]) => void;
  updateChunk: (id: number, patch: Partial<ChunkWithCuration>) => void;
  setFilter: (filter: CurationFilter) => void;
  setFocusedIndex: (index: number) => void;

  /** Counts by curation status */
  getCounts: () => Record<CurationStatus | 'total', number>;
}

export const useChunkReviewStore = create<ChunkReviewStore>()((set, get) => ({
  chunks: [],
  filter: 'all',
  focusedIndex: 0,

  setChunks: (chunks) => set({ chunks, focusedIndex: 0 }),

  updateChunk: (id, patch) =>
    set((state) => ({
      chunks: state.chunks.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  setFilter: (filter) => set({ filter, focusedIndex: 0 }),

  setFocusedIndex: (focusedIndex) => set({ focusedIndex }),

  getCounts: () => {
    const chunks = get().chunks;
    return {
      raw: chunks.filter((c) => c.curationStatus === 'raw').length,
      approved: chunks.filter((c) => c.curationStatus === 'approved').length,
      excluded: chunks.filter((c) => c.curationStatus === 'excluded').length,
      parked: chunks.filter((c) => c.curationStatus === 'parked').length,
      total: chunks.length,
    };
  },
}));
