import { create } from 'zustand';
import type { KnowledgeBaseWithStats } from '@/lib/types';

interface KnowledgeBaseStore {
  knowledgeBases: KnowledgeBaseWithStats[];
  showCreate: boolean;

  setKnowledgeBases: (kbs: KnowledgeBaseWithStats[]) => void;
  addKnowledgeBase: (kb: KnowledgeBaseWithStats) => void;
  updateKnowledgeBase: (id: number, patch: Partial<KnowledgeBaseWithStats>) => void;
  removeKnowledgeBase: (id: number) => void;
  toggleCreate: () => void;
}

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>()((set) => ({
  knowledgeBases: [],
  showCreate: false,

  setKnowledgeBases: (knowledgeBases) => set({ knowledgeBases }),

  addKnowledgeBase: (kb) => set((state) => ({ knowledgeBases: [kb, ...state.knowledgeBases] })),

  updateKnowledgeBase: (id, patch) =>
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) => (kb.id === id ? { ...kb, ...patch } : kb)),
    })),

  removeKnowledgeBase: (id) =>
    set((state) => ({
      knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
    })),

  toggleCreate: () => set((state) => ({ showCreate: !state.showCreate })),
}));
