import { useState, useRef, useEffect } from "react";
import type { Vault } from "../store/vault";
import { useUI } from "../store/ui";
import {
  buildFolderTree,
  unfiledNotes,
  type FolderNode,
} from "../store/selectors";
import { createNote, createFolder, renameFolder, archiveNote } from "../store/notes";
import { resetVault } from "../db/seed";
import { exportVault, parseBackup, restoreBackup } from "../lib/backup";
import { useAi } from "../ai/store";
import { CadenceTasks } from "./CadenceTasks";
import { STATUS_COLOR } from "../db/types";
import type { Note } from "../db/types";
import {
  ResurfaceIcon,
  AskIcon,
  AiIcon,
  GearIcon,
  SearchIcon,
  PlusIcon,
  CaretIcon,
  FolderPlusIcon,
} from "./icons";

export function Sidebar({ vault }: { vault: Vault }) {
  const { view, noteId, setView, open, setSearchOpen } = useUI();
  const setPanel = useAi((s) => s.setPanel);
  const aiPanelOpen = useAi((s) => s.panelOpen);
  const aiEmbed = useAi((s) => s.embed);
  const aiLlm = useAi((s) => s.llm);
  const aiActive = aiEmbed === "ready" || aiLlm === "ready";
  const aiLoading = aiEmbed === "loading" || aiLlm === "loading";
  const tree = buildFolderTree(vault.folders, vault.notes);
  const unfiled = unfiledNotes(vault.notes);

  const navActive = (v: string) => view === v;

  async function newNote(folderId: string | null) {
    const id = await createNote({ folderId, type: "Fleeting" });
    open(id);
  }

  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(vault.folders.map((f) => [f.id, true]))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const toggle = (id: string) =>
    setOpenFolders((s) => ({ ...s, [id]: !(s[id] ?? true) }));

  async function newFolder() {
    // create, expand, and immediately drop into inline naming
    const id = await createFolder("New folder", null);
    setOpenFolders((s) => ({ ...s, [id]: true }));
    setEditingId(id);
  }

  async function handleReset() {
    const ok = window.confirm(
      "Reset Loam to the original sample notes?\n\nThis permanently deletes your current notes, folders, links, and history on this device."
    );
    if (!ok) return;
    await resetVault();
    await useAi.getState().loadVectors();
  }

  // vault backup: export is one click; import replaces after an explicit confirm
  const importInput = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  async function handleImport(file: File) {
    try {
      const backup = parseBackup(await file.text());
      const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : "unknown date";
      const ok = window.confirm(
        `Restore vault from this export (${backup.notes.length} notes, saved ${when})?\n\nThis replaces everything currently in Loam on this device.`
      );
      if (!ok) return;
      // invalidate open editors BEFORE touching the db — their buffered
      // (pre-restore) content must never flush over the restored vault
      useUI.getState().bumpVaultEpoch();
      await restoreBackup(backup);
      await useAi.getState().loadVectors();
    } catch (e) {
      window.alert(`Couldn't restore: ${(e as Error).message}`);
    }
  }

  return (
    <aside style={aside} className="loam-sidebar">
      {/* brand + nav */}
      <div style={brandRow}>
        <div style={logoMark}>
          <div style={logoDot} />
        </div>
        <span style={{ fontWeight: 600, fontSize: 14.5, letterSpacing: "-0.01em" }}>
          Loam
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          <NavBtn active={navActive("resurface")} title="Resurface" onClick={() => setView("resurface")}>
            <ResurfaceIcon />
          </NavBtn>
          <NavBtn active={navActive("ask")} title="Ask" onClick={() => setView("ask")}>
            <AskIcon />
          </NavBtn>
          <NavBtn active={aiPanelOpen} title="Local AI" onClick={() => setPanel(true)}>
            <span style={{ position: "relative", display: "flex" }}>
              <AiIcon />
              {(aiActive || aiLoading) && (
                <span
                  className={aiLoading ? "pulse-dot" : undefined}
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: aiActive ? "var(--live)" : "var(--status-review)",
                  }}
                />
              )}
            </span>
          </NavBtn>
        </div>
      </div>

      {/* search */}
      <div style={{ padding: "0 12px 10px" }}>
        <button style={searchBtn} onClick={() => setSearchOpen(true)} className="rw">
          <SearchIcon />
          <span style={{ fontSize: 12.5 }}>Search</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-fainter)" }}>
            ⌘K
          </span>
        </button>
      </div>

      {/* Notes header */}
      <div style={sectionHeader}>
        <span className="uno">Notes</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button style={miniBtn} className="rw" title="New folder" onClick={newFolder}>
            <FolderPlusIcon />
          </button>
          <button style={miniBtnText} className="rw" title="New note" onClick={() => newNote(null)}>
            <PlusIcon />
            New
          </button>
        </div>
      </div>

      {/* tree */}
      <div style={scroll}>
        {tree.map((node) => (
          <FolderBranch
            key={node.folder.id}
            node={node}
            depth={0}
            openFolders={openFolders}
            toggle={toggle}
            editingId={editingId}
            setEditingId={setEditingId}
            activeNoteId={view === "note" ? noteId : null}
            onOpen={open}
            onNewNote={newNote}
          />
        ))}

        {unfiled.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ ...folderBtn, cursor: "default" }}>
              <span style={{ width: 9 }} />
              <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--text-ghost)" }} />
              <span style={{ flex: 1, textAlign: "left" }}>Unfiled</span>
              <span style={countStyle}>{unfiled.length}</span>
            </div>
            <div style={{ margin: "1px 0 4px" }}>
              {unfiled.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  depth={1}
                  active={view === "note" && noteId === n.id}
                  onOpen={open}
                />
              ))}
            </div>
          </div>
        )}
        <CadenceTasks notes={vault.notes} />
      </div>

      {/* footer */}
      <div style={footerRow}>
        <button
          style={footer}
          className="rw"
          onClick={() => setView("archive")}
          title={`Local-first — your notes never leave this device.${
            persisted == null ? "" : persisted ? " Storage: persistent (protected from eviction)." : " Storage: best-effort — export a backup now and then."
          }`}
        >
          <span style={liveDot} className="pulse-dot" />
          <span>Local · {vault.notes.filter((n) => !n.archivedAt).length} notes</span>
        </button>
        <button
          style={footerGear}
          className="rw"
          onClick={() => void exportVault()}
          title="Export vault — download all notes, links, and history as JSON"
          aria-label="Export vault"
        >
          ↓
        </button>
        <button
          style={footerGear}
          className="rw"
          onClick={() => importInput.current?.click()}
          title="Import vault — restore from an exported JSON file"
          aria-label="Import vault"
        >
          ↑
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleImport(f);
          }}
        />
        <button
          style={footerGear}
          className="rw"
          onClick={handleReset}
          title="Reset to sample data"
          aria-label="Reset to sample data"
        >
          <GearIcon />
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------- branches ------------------------------- */

function FolderBranch({
  node,
  depth,
  openFolders,
  toggle,
  editingId,
  setEditingId,
  activeNoteId,
  onOpen,
  onNewNote,
}: {
  node: FolderNode;
  depth: number;
  openFolders: Record<string, boolean>;
  toggle: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  activeNoteId: string | null;
  onOpen: (id: string) => void;
  onNewNote: (folderId: string | null) => void;
}) {
  const open = openFolders[node.folder.id] ?? true;
  const editing = editingId === node.folder.id;
  return (
    <div style={{ marginBottom: 2 }}>
      <div className="rw folder-row" style={{ ...folderRow, paddingLeft: 8 + depth * 12 }}>
        {editing ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <CaretIcon open={open} />
            <span style={{ width: 7, height: 7, borderRadius: 2, background: node.folder.color, flexShrink: 0 }} />
            <FolderNameInput
              initial={node.folder.name}
              onCommit={(v) => {
                void renameFolder(node.folder.id, v);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          </span>
        ) : (
          <>
            <button
              onClick={() => toggle(node.folder.id)}
              onDoubleClick={() => setEditingId(node.folder.id)}
              aria-expanded={open}
              aria-label={`${node.folder.name} folder, ${node.count} notes`}
              title="Double-click to rename"
              style={folderToggle}
            >
              <CaretIcon open={open} />
              <span style={{ width: 7, height: 7, borderRadius: 2, background: node.folder.color, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.folder.name}
              </span>
            </button>
            <span style={folderRightSlot}>
              <span className="folder-count" style={folderCount}>{node.count}</span>
              <button
                className="folder-add"
                onClick={() => onNewNote(node.folder.id)}
                aria-label={`New note in ${node.folder.name}`}
                title="New note here"
                style={folderAddBtn}
              >
                <PlusIcon size={11} />
              </button>
            </span>
          </>
        )}
      </div>

      {open && (
        <div style={{ margin: "1px 0 4px" }}>
          {node.children.map((child) => (
            <FolderBranch
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              openFolders={openFolders}
              toggle={toggle}
              editingId={editingId}
              setEditingId={setEditingId}
              activeNoteId={activeNoteId}
              onOpen={onOpen}
              onNewNote={onNewNote}
            />
          ))}
          {node.notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              depth={depth + 1}
              active={activeNoteId === n.id}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderNameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={commit}
      aria-label="Folder name"
      placeholder="Folder name"
      style={folderNameInput}
    />
  );
}

function NoteRow({
  note,
  depth,
  active,
  onOpen,
}: {
  note: Note;
  depth: number;
  active: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div
      className="rw loam-noterow"
      style={{
        display: "flex",
        alignItems: "center",
        borderRadius: 6,
        background: active ? "var(--active-row)" : "transparent",
      }}
    >
      <button
        onClick={() => onOpen(note.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          flex: 1,
          minWidth: 0,
          padding: "6px 8px",
          paddingLeft: 14 + depth * 12,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12.5,
          color: active ? "var(--text-strong)" : "var(--text-600)",
          fontWeight: active ? 600 : 400,
          fontFamily: "var(--font-sans)",
          background: "none",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: STATUS_COLOR[note.status] }} />
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {note.title}
        </span>
      </button>
      <button
        className="loam-note-x"
        title={`Archive “${note.title}” — restore anytime from Archive`}
        aria-label={`Archive ${note.title}`}
        onClick={() => void archiveNote(note.id)}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          color: "var(--text-fainter)",
          fontSize: 13,
          lineHeight: 1,
          padding: "4px 8px 4px 2px",
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

function NavBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="rw"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={navBtn(active)}
    >
      {children}
    </button>
  );
}

/* -------------------------------- styles -------------------------------- */

const aside: React.CSSProperties = {
  width: "var(--sidebar-w)",
  flexShrink: 0,
  background: "var(--bg-sidebar)",
  borderRight: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
};
const brandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "16px 14px 12px",
};
const logoMark: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  background: "var(--text-strong)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const logoDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--bg-app)",
};
const searchBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 32,
  width: "100%",
  padding: "0 10px",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-faint)",
  cursor: "pointer",
};
const sectionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 14px 4px",
};
const miniBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-500)",
  borderRadius: 6,
};
const miniBtnText: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "0 6px",
  height: 22,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-500)",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "var(--font-sans)",
  borderRadius: 6,
};
const scroll: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "2px 8px 8px",
};
const folderBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "5px 8px",
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-700)",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: "var(--font-sans)",
  borderRadius: 6,
};
const countStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-fainter)",
};
const folderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "5px 8px",
  borderRadius: 6,
  color: "var(--text-700)",
};
const folderToggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flex: 1,
  minWidth: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: "var(--font-sans)",
  padding: 0,
  textAlign: "left",
};
const folderNameInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-input)",
  borderRadius: 5,
  padding: "1px 5px",
  margin: "-2px 0",
  outline: "none",
  color: "var(--text-strong)",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: "var(--font-sans)",
};
const folderRightSlot: React.CSSProperties = {
  position: "relative",
  width: 16,
  height: 16,
  flexShrink: 0,
};
const folderCount: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-fainter)",
  transition: "opacity 0.12s var(--ease)",
};
const folderAddBtn: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-muted)",
  borderRadius: 4,
  padding: 0,
};
const footerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  borderTop: "1px solid var(--border)",
};
const footer: React.CSSProperties = {
  flex: 1,
  border: "none",
  background: "none",
  textAlign: "left",
  cursor: "pointer",
  padding: "11px 16px",
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-faint)",
};
const footerGear: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: "0 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-faint)",
};
const liveDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--live)",
};

function navBtn(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "none",
    borderRadius: 7,
    cursor: "pointer",
    color: active ? "var(--text-strong)" : "var(--text-faint)",
    background: active ? "var(--active-row)" : "transparent",
  };
}
