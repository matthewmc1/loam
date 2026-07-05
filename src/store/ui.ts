import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { View } from "../db/types";

interface UIState {
  view: View;
  /** active note id, or "__new" for the unsaved new-note scaffold */
  noteId: string | null;
  inspectorOpen: boolean;
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
  setSearchOpen(open: boolean): void;
  setDraftFolder(id: string | null): void;
  bumpVaultEpoch(): void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: "note",
      noteId: null,
      inspectorOpen: true,
      searchOpen: false,
      draftFolderId: null,
      vaultEpoch: 0,

      open: (noteId) => set({ view: "note", noteId }),
      bumpVaultEpoch: () => set((s) => ({ vaultEpoch: s.vaultEpoch + 1 })),
      setView: (view) => set({ view }),
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
