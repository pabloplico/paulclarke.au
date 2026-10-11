import { create } from 'zustand';

interface WorkspaceViewStore {
  editingSectionId: number | null;
  versionPanelSectionId: number | null;
  versionPanelAnchorRect: DOMRect | null;

  setEditingSectionId: (id: number | null) => void;
  setVersionPanelSectionId: (id: number | null) => void;
  openVersionPanel: (sectionId: number, anchorRect: DOMRect) => void;
  closeVersionPanel: () => void;
}

export const useWorkspaceViewStore = create<WorkspaceViewStore>()((set) => ({
  editingSectionId: null,
  versionPanelSectionId: null,
  versionPanelAnchorRect: null,

  setEditingSectionId: (editingSectionId) => set({ editingSectionId }),
  setVersionPanelSectionId: (versionPanelSectionId) =>
    set({ versionPanelSectionId, versionPanelAnchorRect: null }),
  openVersionPanel: (sectionId, anchorRect) =>
    set({ versionPanelSectionId: sectionId, versionPanelAnchorRect: anchorRect }),
  closeVersionPanel: () => set({ versionPanelSectionId: null, versionPanelAnchorRect: null }),
}));
