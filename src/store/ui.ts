import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { View } from "../db/types";

interface UIState {
  view: View;
  /** active note id, or "__new" for the unsaved new-note scaffold */
  noteId: string | null;
  inspectorOpen: boolean;
  /** drawers, for layouts where a panel slides over the note instead of sitting beside it */
  inspectorDrawer: boolean;
  sidebarDrawer: boolean;
  searchOpen: boolean;
  /** folder to drop new notes into when created from the global "New" button */
  draftFolderId: string | null;
  /**
   * Bumped when the vault is replaced wholesale (import/restore). Editors key
   * on it so stale instances remount instead of flushing pre-restore content
   * over the restored data.
   */
  vaultEpoch: number;

  open(noteId: string): void;
  setView(view: View): void;
  toggleInspector(): void;
  setInspector(open: boolean): void;
  setInspectorDrawer(open: boolean): void;
  setSidebarDrawer(open: boolean): void;
  setSearchOpen(open: boolean): void;
  setDraftFolder(id: string | null): void;
  bumpVaultEpoch(): void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: "today",
      noteId: null,
      inspectorOpen: true,
      inspectorDrawer: false,
      sidebarDrawer: false,
      searchOpen: false,
      draftFolderId: null,
      vaultEpoch: 0,

      // going somewhere always puts the drawers away
      open: (noteId) => set({ view: "note", noteId, sidebarDrawer: false, inspectorDrawer: false }),
      bumpVaultEpoch: () => set((s) => ({ vaultEpoch: s.vaultEpoch + 1 })),
      setView: (view) => set({ view, sidebarDrawer: false, inspectorDrawer: false }),
      setInspectorDrawer: (open) => set({ inspectorDrawer: open }),
      setSidebarDrawer: (open) => set({ sidebarDrawer: open }),
      toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
      setInspector: (open) => set({ inspectorOpen: open }),
      setSearchOpen: (open) => set({ searchOpen: open }),
      setDraftFolder: (id) => set({ draftFolderId: id }),
    }),
    {
      name: "loam-ui",
      partialize: (s) => ({ inspectorOpen: s.inspectorOpen }),
    }
  )
);
