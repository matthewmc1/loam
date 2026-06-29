import { useEffect, useMemo, useRef, useState } from "react";
import type { Vault } from "../store/vault";
import { useUI } from "../store/ui";
import { liveNotes } from "../store/selectors";
import { createNote } from "../store/notes";
import { STATUS_COLOR, type Note } from "../db/types";
import { relativeTime } from "../lib/time";

export function CommandPalette({ vault }: { vault: Vault }) {
  const { searchOpen, setSearchOpen, open } = useUI();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const notes = liveNotes(vault.notes);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
    return notes
      .map((n) => {
        const hay = (n.title + " " + n.tags.join(" ") + " " + n.text).toLowerCase();
        let score = 0;
        if (n.title.toLowerCase().includes(query)) score += 10;
        if (n.tags.some((t) => t.toLowerCase().includes(query))) score += 4;
        if (hay.includes(query)) score += 1;
        return { n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.n);
  }, [q, notes]);

  const canCreate = q.trim().length > 0;
  const total = results.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (searchOpen) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      setQ("");
      setSel(0);
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  // restore focus to wherever it was when the palette closes
  useEffect(() => {
    if (!searchOpen && prevFocus.current) {
      prevFocus.current.focus?.();
      prevFocus.current = null;
    }
  }, [searchOpen]);

  useEffect(() => setSel(0), [q]);

  if (!searchOpen) return null;

  const choose = async (i: number) => {
    if (i < results.length) {
      open(results[i].id);
    } else if (canCreate) {
      const id = await createNote({ title: q.trim(), type: "Fleeting" });
      open(id);
    }
    setSearchOpen(false);
  };

  return (
    <div style={backdrop} onMouseDown={() => setSearchOpen(false)}>
      <div
        style={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes, or type to create…"
          aria-label="Search notes, or type to create"
          style={input}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % Math.max(total, 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + total) % Math.max(total, 1)); }
            else if (e.key === "Enter") { e.preventDefault(); void choose(sel); }
            else if (e.key === "Escape") setSearchOpen(false);
            else if (e.key === "Tab") e.preventDefault(); // trap focus in the palette
          }}
        />
        <div style={list}>
          {results.map((n, i) => (
            <Row key={n.id} note={n} active={i === sel} folder={folderName(vault, n)} onClick={() => void choose(i)} onHover={() => setSel(i)} />
          ))}
          {canCreate && (
            <button
              className="rw"
              tabIndex={-1}
              aria-selected={sel === results.length}
              style={{ ...rowStyle, background: sel === results.length ? "var(--hover-row)" : "transparent" }}
              onMouseMove={() => setSel(results.length)}
              onMouseDown={(e) => { e.preventDefault(); void choose(results.length); }}
            >
              <span style={{ width: 6, color: "var(--text-muted)", fontWeight: 600, textAlign: "center" }}>+</span>
              <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-body)" }}>
                Create “{q.trim()}”
              </span>
              <span style={hintKbd}>↵</span>
            </button>
          )}
          {results.length === 0 && !canCreate && (
            <div style={{ padding: 16, color: "var(--text-ghost)", fontSize: 13 }}>No notes yet.</div>
          )}
        </div>
        <div style={footer}>
          <span><span style={hintKbd}>↑↓</span> navigate</span>
          <span><span style={hintKbd}>↵</span> open</span>
          <span><span style={hintKbd}>esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  note,
  active,
  folder,
  onClick,
  onHover,
}: {
  note: Note;
  active: boolean;
  folder: string;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      className="rw"
      tabIndex={-1}
      aria-selected={active}
      style={{ ...rowStyle, background: active ? "var(--hover-row)" : "transparent" }}
      onMouseMove={onHover}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: STATUS_COLOR[note.status] }} />
      <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {note.title}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-fainter)" }}>{folder}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-fainter)", width: 56, textAlign: "right" }}>
        {relativeTime(note.updatedAt)}
      </span>
    </button>
  );
}

function folderName(vault: Vault, n: Note): string {
  return vault.folders.find((f) => f.id === n.folderId)?.name ?? "Unfiled";
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#1b1b1818",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "14vh",
  zIndex: 200,
};
const panel: React.CSSProperties = {
  width: 560,
  maxWidth: "92vw",
  background: "var(--bg-sidebar)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "0 24px 60px -16px #1b1b1840, 0 4px 12px #1b1b1818",
  overflow: "hidden",
  animation: "fadeUp .14s var(--ease)",
};
const input: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid var(--border-subtle)",
  background: "none",
  outline: "none",
  padding: "16px 18px",
  fontSize: 15.5,
  fontFamily: "var(--font-sans)",
  color: "var(--text-strong)",
};
const list: React.CSSProperties = { padding: 6, maxHeight: 360, overflowY: "auto" };
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  width: "100%",
  padding: "9px 12px",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "var(--font-sans)",
};
const footer: React.CSSProperties = {
  display: "flex",
  gap: 16,
  padding: "9px 16px",
  borderTop: "1px solid var(--border-subtle)",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-fainter)",
};
const hintKbd: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  background: "var(--bg-input)",
  borderRadius: 4,
  padding: "1px 5px",
  color: "var(--text-muted)",
};
