import { create } from 'zustand';

export type QualityFlag = {
  stage: 'clean' | 'chunk' | 'extract' | 'route';
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type InboxItem = {
  id: number;
  type: string;
  title: string;
  content: string | null;
  documentId: number | null;
  status: string;
  routingResults: RoutingSuggestion[] | null;
  approvedResults: ApprovedResult[] | null;
  processingError: string | null;
  qualityFlags: QualityFlag[] | null;
  gapFindingRef: Record<string, unknown> | null;
  documentStatus: string | null;
  documentError: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type RoutingSuggestion = {
  workspaceId: number;
  workspaceTitle: string;
  sectionId: number;
  sectionTitle: string;
  confidence: number;
  action: string;
  suggestedContent: string;
  reasoning: string;
};

export type ApprovedResult = {
  workspaceId: number;
  workspaceTitle: string;
  workspaceSlug: string;
  sectionId: number;
  sectionTitle: string;
  versionId?: number;
  approvedAt: string;
};

interface InboxStore {
  items: InboxItem[];
  loading: boolean;

  setItems: (items: InboxItem[]) => void;
  addItem: (item: InboxItem) => void;
  updateItem: (id: number, patch: Partial<InboxItem>) => void;
  removeItem: (id: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useInboxStore = create<InboxStore>()((set) => ({
  items: [],
  loading: false,

  setItems: (items) => set({ items }),
  addItem: (item) => set((state) => ({ items: [item, ...state.items] })),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  setLoading: (loading) => set({ loading }),
}));
