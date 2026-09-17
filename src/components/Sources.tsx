import { useMemo, useState } from "react";
import type { Note } from "../db/types";
import { addRef, removeRef, renameRef } from "../store/notes";
import { extractExternalLinks } from "../lib/doc";
import { normalizeUrl, urlHost, urlKey, urlLabel } from "../lib/url";
import { CloseIcon } from "./icons";

/** Distinct external URLs a note points at — attached or written in the prose. */
export function sourceCount(note: Note): number {
  const keys = new Set((note.refs ?? []).map((r) => urlKey(r.url)));
  for (const l of extractExternalLinks(note.doc)) keys.add(urlKey(l.url));
  return keys.size;
}

/**
 * Everything outside the vault this note points at: references attached here
 * by hand, plus the links written into the prose (discovered, read-only —
 * edit those where they live). One list, so "what is this note built on?" has
 * a single answer.
 */
export function Sources({ note }: { note: Note }) {
  const refs = note.refs ?? [];
  const inProse = useMemo(() => {
    const attached = new Set(refs.map((r) => urlKey(r.url)));
    return extractExternalLinks(note.doc).filter((l) => !attached.has(urlKey(l.url)));
  }, [note.doc, refs]);

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {refs.length === 0 && inProse.length === 0 && (
        <div style={hint}>Nothing cited yet. Attach a source, or paste a link into the note.</div>
      )}
      {refs.map((r) => (
        <Row
          key={r.id}
          url={r.url}
          title={r.title}
          onRename={(t) => void renameRef(note.id, r.id, t)}
          onRemove={() => void removeRef(note.id, r.id)}
        />
      ))}
      {inProse.map((l) => (
        <Row key={l.url} url={l.url} title={l.text === l.url ? "" : l.text} inText />
      ))}
      <AddSource onAdd={(url) => addRef(note.id, url)} />
    </div>
  );
}

function Row({
  url,
  title,
  inText,
  onRename,
  onRemove,
}: {
  url: string;
  title: string;
  inText?: boolean;
  onRename?: (title: string) => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(title);
  const href = normalizeUrl(url);
  const shown = title || urlLabel(url);

  return (
    <div className="rw" style={row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={v}
            placeholder={urlLabel(url)}
            aria-label="Source title"
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (v.trim() !== title) onRename?.(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setV(title);
                setEditing(false);
              }
            }}
            style={titleInput}
          />
        ) : (
          <button
            type="button"
            style={{ ...titleBtn, cursor: onRename ? "text" : "default" }}
            title={onRename ? "Rename" : "Linked in the note’s text"}
            onClick={() => {
              if (!onRename) return;
              setV(title);
              setEditing(true);
            }}
          >
            {shown}
          </button>
        )}
        <div style={meta}>
          {urlHost(url)}
          {inText && <span style={inTextTag}>in text</span>}
        </div>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" style={openBtn} title={url} aria-label={`Open ${shown}`}>
          ↗
        </a>
      )}
      {onRemove && (
        <button style={removeBtn} title="Remove source" aria-label={`Remove ${shown}`} onClick={onRemove}>
          <CloseIcon size={10} />
        </button>
      )}
    </div>
  );
}

function AddSource({ onAdd }: { onAdd: (url: string) => Promise<boolean> }) {
  const [active, setActive] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setActive(false);
    setQ("");
    setError(null);
  };

  const commit = async () => {
    if (!q.trim()) return close();
    if (!normalizeUrl(q)) return setError("That doesn’t look like a link.");
    if (await onAdd(q)) close();
    else setError("Already attached to this note.");
  };

  if (!active)
    return (
      <button className="rw" style={addBtn} onClick={() => setActive(true)}>
        + attach a source
      </button>
    );

  return (
    <div style={{ marginTop: 4 }}>
      <input
        autoFocus
        value={q}
        spellCheck={false}
        placeholder="Paste a URL…"
        aria-label="Source URL"
        aria-invalid={!!error}
        onChange={(e) => {
          setQ(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") close();
        }}
        onBlur={() => {
          // a pasted-then-clicked-away URL is intent, not abandonment
          if (normalizeUrl(q)) void commit();
          else close();
        }}
        style={{ ...addInput, borderColor: error ? "var(--danger)" : "var(--border-strong)" }}
      />
      {error && <div style={{ ...hint, color: "var(--danger)", paddingTop: 4 }}>{error}</div>}
    </div>
  );
}

/* -------------------------------- styles -------------------------------- */

const hint: React.CSSProperties = { fontSize: 12, color: "var(--text-ghost)", padding: "2px 8px", lineHeight: 1.5 };
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 4px 5px 8px",
  borderRadius: 7,
};
const titleBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "none",
  border: "none",
  padding: 0,
  textAlign: "left",
  fontFamily: "var(--font-sans)",
  fontSize: 12.5,
  color: "var(--text-body)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const titleInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 5,
  padding: "1px 5px",
  background: "var(--bg-main)",
  fontFamily: "var(--font-sans)",
  fontSize: 12.5,
  color: "var(--text-body)",
  outline: "none",
};
const meta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 1,
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-fainter)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const inTextTag: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "0 4px",
  fontSize: 9.5,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};
const iconBtn: React.CSSProperties = {
  flexShrink: 0,
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "none",
  borderRadius: 5,
  cursor: "pointer",
  color: "var(--text-muted)",
  textDecoration: "none",
};
const openBtn: React.CSSProperties = { ...iconBtn, fontSize: 13 };
const removeBtn: React.CSSProperties = { ...iconBtn, color: "var(--text-fainter)" };
const addBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  border: "1px dashed var(--border-strong)",
  background: "none",
  borderRadius: 7,
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
};
const addInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-input)",
  borderRadius: 7,
  padding: "6px 9px",
  outline: "none",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "var(--text-body)",
};
