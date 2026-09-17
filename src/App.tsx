import { useEffect, useMemo, useRef } from "react";
import { seedIfEmpty } from "./db/seed";
import { createNote } from "./store/notes";
import { navBus, tagBus } from "./lib/bus";
import { useVault } from "./store/vault";
import { useUI } from "./store/ui";
import { useAi } from "./ai/store";
import { useCadence } from "./cadence/store";
import { liveNotes } from "./store/selectors";
import { Sidebar } from "./components/Sidebar";
import { NoteView } from "./components/NoteView";
import { ResurfaceView } from "./components/views/ResurfaceView";
import { AskView } from "./components/views/AskView";
import { ArchiveView } from "./components/views/ArchiveView";
import { TodayView } from "./components/views/TodayView";
import { CommandPalette } from "./components/CommandPalette";
import { AiPanel } from "./components/AiPanel";
import { CadencePanel } from "./components/CadencePanel";
import { Notices } from "./components/Notices";
import { sweepAssets } from "./lib/assets";
import { useViewport } from "./lib/useViewport";
import { SearchIcon } from "./components/icons";

export function App() {
  const vault = useVault();
  const { view, noteId, open, setSearchOpen, sidebarDrawer, setSidebarDrawer } = useUI();
  const narrow = useViewport() === "narrow";

  // one-time local seed
  useEffect(() => {
    void seedIfEmpty();
  }, []);

  // images nothing references any more (removed from a note over a day ago)
  useEffect(() => {
    const t = window.setTimeout(() => void sweepAssets(), 8000);
    return () => window.clearTimeout(t);
  }, []);

  // load cached embeddings (and auto-resume the model if it was enabled)
  const aiEmbed = useAi((s) => s.embed);
  const aiVectors = useAi((s) => s.vectors);
  useEffect(() => {
    void useAi.getState().loadVectors();
  }, []);

  // load queued offline work, then auto-connect to Cadence if a token was saved
  useEffect(() => {
    void useCadence.getState().init();
    if (useCadence.getState().token) void useCadence.getState().connect();
  }, []);

  // keep embeddings fresh: embed notes that don't have a vector yet
  useEffect(() => {
    if (aiEmbed !== "ready") return;
    const missing = liveNotes(vault.notes).filter((n) => !aiVectors.has(n.id));
    if (missing.length === 0) return;
    const t = window.setTimeout(() => {
      missing.slice(0, 20).forEach((n) => void useAi.getState().embedNote(n));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [aiEmbed, aiVectors, vault.notes]);

  // wikilink + tag navigation from deep inside the editor
  const notesRef = useRef(vault.notes);
  notesRef.current = vault.notes;
  useEffect(() => {
    const offNav = navBus.on(async ({ id, title }) => {
      if (id && notesRef.current.some((n) => n.id === id && !n.archivedAt)) {
        open(id);
        return;
      }
      const found = notesRef.current.find(
        (n) => !n.archivedAt && n.title.toLowerCase() === title.toLowerCase()
      );
      if (found) {
        open(found.id);
        return;
      }
      if (title.trim()) {
        const newId = await createNote({ title: title.trim(), type: "Fleeting" });
        open(newId);
      }
    });
    const offTag = tagBus.on(() => setSearchOpen(true));
    return () => {
      offNav();
      offTag();
    };
  }, [open, setSearchOpen]);

  // Escape puts a drawer away (the scrim does the same for pointers)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const ui = useUI.getState();
      if (ui.sidebarDrawer) ui.setSidebarDrawer(false);
      else if (ui.inspectorDrawer) ui.setInspectorDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // global ⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // inside a note ⌘K belongs to the editor (insert menu) — it claims the
      // event with preventDefault before it bubbles up to here
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  const notes = liveNotes(vault.notes);

  // resolve the active note; fall back to a rich default, then the first note
  const activeId = useMemo(() => {
    if (noteId && notes.some((n) => n.id === noteId)) return noteId;
    return notes.find((n) => n.id === "moat")?.id ?? notes[0]?.id ?? null;
  }, [noteId, notes]);

  useEffect(() => {
    if (view === "note" && activeId && activeId !== noteId) open(activeId);
  }, [view, activeId, noteId, open]);

  return (
    <div style={shell} className={"loam-shell" + (sidebarDrawer ? " sidebar-open" : "")}>
      <Sidebar vault={vault} />
      {narrow && sidebarDrawer && <div className="loam-scrim" onClick={() => setSidebarDrawer(false)} aria-hidden />}
      <main style={main} className="loam-main">
        {narrow && (
          <header className="loam-topbar">
            <button type="button" aria-label="Open navigation" aria-expanded={sidebarDrawer} onClick={() => setSidebarDrawer(true)}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 5.5h12M3 9h12M3 12.5h12" />
              </svg>
            </button>
            <span className="loam-topbar-title">Loam</span>
            <button type="button" aria-label="Search notes" onClick={() => setSearchOpen(true)}>
              <SearchIcon size={16} />
            </button>
          </header>
        )}
        {view === "today" && <TodayView vault={vault} />}
        {view === "note" && <NoteView vault={vault} noteId={activeId} />}
        {view === "resurface" && <ResurfaceView vault={vault} />}
        {view === "ask" && <AskView vault={vault} />}
        {view === "archive" && <ArchiveView vault={vault} />}
      </main>
      <CommandPalette vault={vault} />
      <AiPanel vault={vault} />
      <CadencePanel />
      <Notices />
    </div>
  );
}

const shell: React.CSSProperties = {
  display: "flex",
  // 100%, not 100vh: the shell is zoomed by --ui-scale on large screens, and
  // zoom multiplies viewport units — a percentage still resolves to the real viewport
  height: "100%",
  zoom: "var(--ui-scale)",
  overflow: "hidden",
  background: "var(--bg-app)",
};

const main: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  background: "var(--bg-main)",
};
