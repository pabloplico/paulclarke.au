import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DocumentWithChunks } from './page';
import type { StatusFilter } from './utils';

interface DocumentStore {
  documents: DocumentWithChunks[];
  statusFilter: StatusFilter;
  typeFilter: string | null;
  selectedKbId: number | null;
  showUpload: boolean;
  selectedIds: Set<number>;

  setDocuments: (docs: DocumentWithChunks[]) => void;
  addDocument: (doc: DocumentWithChunks) => void;
  removeDocument: (id: number) => void;
  updateDocument: (id: number, patch: Partial<DocumentWithChunks>) => void;
  setFilter: (filter: StatusFilter) => void;
  setTypeFilter: (type: string | null) => void;
  setSelectedKbId: (id: number | null) => void;
  toggleUpload: () => void;
  toggleSelected: (id: number) => void;
  selectAll: (ids: number[]) => void;
  clearSelection: () => void;
}

export const useDocumentStore = create<DocumentStore>()(
  persist(
    (set) => ({
      documents: [],
      statusFilter: 'all',
      typeFilter: null,
      selectedKbId: null,
      showUpload: false,
      selectedIds: new Set(),

      setDocuments: (documents) => set({ documents }),

      addDocument: (doc) => set((state) => ({ documents: [doc, ...state.documents] })),

      removeDocument: (id) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
          selectedIds: new Set([...state.selectedIds].filter((sid) => sid !== id)),
        })),

      updateDocument: (id, patch) =>
        set((state) => ({
          documents: state.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),

      setFilter: (statusFilter) => set({ statusFilter, selectedIds: new Set() }),

      setTypeFilter: (typeFilter) => set({ typeFilter, selectedIds: new Set() }),

      setSelectedKbId: (selectedKbId) => set({ selectedKbId }),

      toggleUpload: () => set((state) => ({ showUpload: !state.showUpload })),

      toggleSelected: (id) =>
        set((state) => {
          const next = new Set(state.selectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedIds: next };
        }),

      selectAll: (ids) => set({ selectedIds: new Set(ids) }),

      clearSelection: () => set({ selectedIds: new Set() }),
    }),
    {
      name: 'admin-documents',
      partialize: (state) => ({
        statusFilter: state.statusFilter,
        typeFilter: state.typeFilter,
        showUpload: state.showUpload,
      }),
    }
  )
);
