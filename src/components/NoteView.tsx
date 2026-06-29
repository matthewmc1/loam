import { useEffect, useMemo, useRef, useState } from "react";
import type { Vault } from "../store/vault";
import { useUI } from "../store/ui";
import { backlinksOf, outboundIds } from "../store/selectors";
import {
  renameNote,
  setStatus,
  setType,
  verifyNote,
  createNote,
  addTag,
  removeTag,
} from "../store/notes";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  NOTE_STATUSES,
  NOTE_TYPES,
  type Note,
} from "../db/types";
import { relativeTime, shortDate, cadenceDays, daysSince } from "../lib/time";
import { InspectorIcon, CheckIcon } from "./icons";
import { Menu, MenuItem } from "./ui/Menu";
import { Editor } from "./editor/Editor";
import { Inspector } from "./Inspector";

export function NoteView({ vault, noteId }: { vault: Vault; noteId: string | null }) {
  const { inspectorOpen, toggleInspector, open } = useUI();
  const note = vault.notes.find((n) => n.id === noteId && !n.archivedAt);

  if (!note) {
    return (
      <div style={empty}>
        <div style={{ textAlign: "center", maxWidth: 300 }}>
          <span
            className="pulse-dot"
            style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: "var(--live)", margin: "0 auto 22px" }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 7 }}>Nothing open yet.</p>
          <p style={{ color: "var(--text-faint)", fontSize: 13, lineHeight: 1.7 }}>
            Press <span style={kbd}>⌘K</span> to follow a thread of thought, or start a note to plant one.
          </p>
        </div>
      </div>
    );
  }

  const folder = vault.folders.find((f) => f.id === note.folderId);
  const linkCount = outboundIds(note).length;
  const backlinks = backlinksOf(vault.notes, note.id).filter((n) => !n.archivedAt);
  const isFresh = note.text.trim() === "" && (note.status === "draft" || note.status === "fleeting");

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* editor bar */}
        <div style={bar}>
          <span style={crumb}>
            <span
              style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[note.status], marginRight: 8, verticalAlign: "middle" }}
            />
            {folder?.name ?? "Unfiled"} &nbsp;·&nbsp; {note.title}
          </span>
          <span style={editedAt}>edited {relativeTime(note.updatedAt)}</span>
          <button
            className="rw"
            onClick={toggleInspector}
            aria-label="Toggle metadata panel"
            aria-pressed={inspectorOpen}
            title="Toggle metadata"
            style={inspBtn(inspectorOpen)}
          >
            <InspectorIcon />
          </button>
        </div>

        {/* canvas */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={page} className="loam-page">
            {isFresh && <TypePicker note={note} />}

            <TitleInput note={note} />

            <MetaRow note={note} linkCount={linkCount} backlinkCount={backlinks.length} />

            <TagRow note={note} vault={vault} />

            <div style={divider} />

            {isFresh && (
              <div style={watching}>
                <span className="loam-sense" />
                <span>Loam is listening for links as this note takes shape</span>
              </div>
            )}

            <Editor key={note.id} note={note} notes={vault.notes} />

            {note.pendingLinks.length > 0 && (
              <PendingLinks note={note} />
            )}

            {/* backlinks */}
            <div style={backlinkWrap}>
              <div style={backlinkHead}>
                <span className="uno">Linked from</span>
                <span style={countBadge}>{backlinks.length}</span>
              </div>
              {backlinks.length === 0 ? (
                <div style={backlinkEmpty}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", border: "1px dashed var(--text-fainter)", flexShrink: 0 }} />
                  Nothing links here yet — reference this note from others to start compounding.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {backlinks.map((n) => (
                    <button
                      key={n.id}
                      className="rw loam-backlink"
                      onClick={() => open(n.id)}
                      style={backlinkRow}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5, background: STATUS_COLOR[n.status] }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 14, color: "var(--text-body)", fontWeight: 500 }}>{n.title}</span>
                        {n.text.trim() && <span style={backlinkExcerpt}>{n.text.trim().slice(0, 96)}</span>}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-fainter)", marginLeft: "auto", paddingLeft: 10, flexShrink: 0 }}>
                        {vault.folders.find((f) => f.id === n.folderId)?.name ?? "Unfiled"}
                      </span>
                      <span className="loam-arrow">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {inspectorOpen && <Inspector key={note.id} note={note} vault={vault} />}
    </div>
  );
}

/* ------------------------------- title ---------------------------------- */

function TitleInput({ note }: { note: Note }) {
  const [value, setValue] = useState(note.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // reset only when switching to a different note, so a debounced rename of the
  // current note doesn't stomp what the user is actively typing
  useEffect(() => setValue(note.title), [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grow = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = el.scrollHeight + "px";
    }
  };
  useEffect(grow, [value]);

  const commit = (v: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void renameNote(note.id, v), 400);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      spellCheck
      placeholder="Untitled"
      onChange={(e) => {
        setValue(e.target.value.replace(/\n/g, ""));
        commit(e.target.value.replace(/\n/g, ""));
      }}
      onBlur={() => void renameNote(note.id, value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      style={titleStyle(value.trim() === "")}
    />
  );
}

/* ------------------------------ type picker ----------------------------- */

function TypePicker({ note }: { note: Note }) {
  return (
    <div style={typeTrack}>
      {NOTE_TYPES.map((t) => {
        const active = note.type === t;
        return (
          <button
            key={t}
            onClick={() => void setType(note.id, t)}
            style={{
              padding: "6px 12px",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              color: active ? "var(--text-strong)" : "var(--text-muted)",
              background: active ? "var(--bg-main)" : "transparent",
              boxShadow: active ? "0 1px 2px #0000000f" : "none",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------- tags ---------------------------------- */

function TagRow({ note, vault }: { note: Note; vault: Vault }) {
  const allTags = useMemo(
    () =>
      Array.from(new Set(vault.notes.flatMap((n) => n.tags)))
        .filter((t) => !note.tags.some((x) => x.toLowerCase() === t.toLowerCase()))
        .sort(),
    [vault.notes, note.tags]
  );
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const commit = () => {
    const v = q.trim();
    if (v) void addTag(note.id, v);
    setQ("");
  };

  return (
    <div style={tagRow}>
      {note.tags.map((t) => {
        const removable = note.manualTags.some((m) => m.toLowerCase() === t.toLowerCase());
        return (
          <span key={t} style={tagChip} className={removable ? "loam-tag" : undefined}>
            <span style={{ color: "var(--text-ghost)" }}>#</span>
            {t}
            {removable && (
              <button
                className="loam-tag-x"
                aria-label={`Remove #${t}`}
                title={`Remove #${t}`}
                onClick={() => void removeTag(note.id, t)}
                style={tagRemove}
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {open ? (
        <span style={tagInputWrap}>
          <span style={{ color: "var(--text-ghost)" }}>#</span>
          <input
            autoFocus
            list="loam-all-tags"
            value={q}
            placeholder="tag"
            aria-label="Add a tag"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setQ("");
                setOpen(false);
              }
            }}
            onBlur={() => {
              commit();
              setOpen(false);
            }}
            style={tagInput}
          />
          <datalist id="loam-all-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </span>
      ) : (
        <button
          className="loam-pending"
          style={addTagChip}
          onClick={() => setOpen(true)}
          aria-label="Add a tag"
        >
          <span className="loam-plus" style={{ fontWeight: 600 }}>
            +
          </span>
          tag
        </button>
      )}
    </div>
  );
}

/* -------------------------------- meta ---------------------------------- */

function MetaRow({
  note,
  linkCount,
  backlinkCount,
}: {
  note: Note;
  linkCount: number;
  backlinkCount: number;
}) {
  const needsVerify = note.status !== "verified" && note.status !== "fleeting";
  const conf = Math.round(note.confidence * 100);
  const cadence = cadenceDays(note.reviewCadence);
  const stale =
    note.verifiedAt != null && cadence != null && daysSince(note.verifiedAt) > cadence;
  return (
    <div style={metaRow}>
      <Menu
        width={188}
        trigger={({ toggle }) => (
          <button onClick={toggle} style={statusPill} title="Change status">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[note.status] }} />
            {STATUS_LABEL[note.status]}
          </button>
        )}
      >
        {(close) =>
          NOTE_STATUSES.map((s) => (
            <MenuItem
              key={s}
              dot={STATUS_COLOR[s]}
              active={s === note.status}
              onClick={() => {
                void setStatus(note.id, s);
                close();
              }}
            >
              {STATUS_LABEL[s]}
            </MenuItem>
          ))
        }
      </Menu>

      <span style={dotSep}>·</span>
      <span>{note.type}</span>

      <span style={dotSep}>·</span>
      <span style={metaCluster} title={`Confidence ${conf}%`}>
        <span style={confTrack}>
          <span
            style={{
              ...confFill,
              width: `${conf}%`,
              background:
                conf >= 66 ? "var(--gauge-high)" : conf >= 33 ? "var(--gauge-mid)" : "var(--gauge-low)",
            }}
          />
        </span>
        {conf}%
      </span>

      <span style={dotSep}>·</span>
      <span
        style={{ ...metaCluster, color: stale ? "var(--accent-action)" : "var(--text-faint)" }}
        title={
          note.verifiedAt
            ? `Last verified ${shortDate(note.verifiedAt)}${cadence ? ` · review every ${cadence}d` : ""}`
            : "Never verified"
        }
      >
        {stale && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent-action)" }} />}
        {note.verifiedAt ? `verified ${relativeTime(note.verifiedAt)}` : "unverified"}
      </span>

      <span style={dotSep}>·</span>
      <span style={metaCluster} title={`${linkCount} outbound · ${backlinkCount} inbound`}>
        <span style={{ color: "var(--text-fainter)" }}>↗</span>
        {linkCount}
        <span style={{ color: "var(--text-fainter)", marginLeft: 7 }}>↙</span>
        {backlinkCount}
      </span>

      {needsVerify && (
        <button style={verifyBtn} className="rw" onClick={() => void verifyNote(note.id)}>
          <CheckIcon size={11} />
          Verify
        </button>
      )}
    </div>
  );
}

/* ---------------------------- pending links ----------------------------- */

function PendingLinks({ note }: { note: Note }) {
  return (
    <div style={pendingWrap}>
      <div className="uno" style={{ marginBottom: 4 }}>
        Unlinked mentions · {note.pendingLinks.length}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Mentioned here but not yet notes themselves — create them to compound the graph.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {note.pendingLinks.map((title) => (
          <button
            key={title}
            className="loam-pending"
            style={pendingChip}
            onClick={() =>
              void createNote({
                title,
                type: "Fleeting",
                folderId: note.folderId,
                derivedFrom: { id: note.id, kind: "derived_from", label: `branched from “${note.title}”` },
              })
            }
            title="Create this note"
          >
            <span className="loam-plus" style={{ color: "var(--text-muted)", fontWeight: 600 }}>+</span>
            {title}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- styles -------------------------------- */

const bar: React.CSSProperties = {
  height: 46,
  flexShrink: 0,
  borderBottom: "1px solid var(--border-subtle)",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 18px",
};
const crumb: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-faint)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const editedAt: React.CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-fainter)",
};
const page: React.CSSProperties = {
  maxWidth: "var(--editor-max)",
  margin: "0 auto",
  padding: "52px 40px 160px",
};
const typeTrack: React.CSSProperties = {
  display: "inline-flex",
  gap: 2,
  padding: 3,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  marginBottom: 26,
};
const metaRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 9,
  marginBottom: 10,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-faint)",
};
const statusPill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: "none",
  background: "none",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-faint)",
  padding: 0,
};
const dotSep: React.CSSProperties = { color: "var(--border-strong)" };
const metaCluster: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5 };
const confTrack: React.CSSProperties = {
  width: 34,
  height: 4,
  borderRadius: 2,
  background: "var(--gauge-track)",
  overflow: "hidden",
  flexShrink: 0,
};
const confFill: React.CSSProperties = { display: "block", height: "100%", borderRadius: 2 };
const verifyBtn: React.CSSProperties = {
  marginLeft: 4,
  display: "flex",
  alignItems: "center",
  gap: 4,
  border: "1px solid var(--border)",
  background: "var(--bg-sidebar)",
  cursor: "pointer",
  borderRadius: 6,
  padding: "3px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--status-verified-soft)",
};
const tagRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  marginBottom: 26,
};
const tagChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  fontSize: 12,
  color: "var(--text-500)",
  fontFamily: "var(--font-mono)",
};
const tagRemove: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-fainter)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  lineHeight: 1,
  padding: "0 1px",
  marginLeft: 1,
};
const addTagChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11.5,
  fontFamily: "var(--font-mono)",
  color: "var(--text-faint)",
  background: "transparent",
  border: "1px dashed var(--border-strong)",
  borderRadius: 7,
  padding: "3px 9px",
  cursor: "pointer",
};
const tagInputWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "3px 8px",
};
const tagInput: React.CSSProperties = {
  border: "none",
  background: "none",
  outline: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-body)",
  width: 80,
  padding: 0,
};
const divider: React.CSSProperties = {
  borderTop: "1px solid var(--border-subtle)",
  paddingTop: 26,
};
const watching: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 22,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-fainter)",
};
const backlinkWrap: React.CSSProperties = {
  marginTop: 48,
  borderTop: "1px solid var(--border-subtle)",
  paddingTop: 22,
};
const backlinkHead: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 };
const countBadge: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-faint)",
  background: "var(--bg-input)",
  padding: "1px 7px",
  borderRadius: 20,
};
const backlinkExcerpt: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  fontFamily: "var(--font-sans)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "46ch",
};
const backlinkEmpty: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 12px",
  border: "1px dashed var(--border-strong)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--text-faint)",
};
const backlinkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 11,
  width: "100%",
  padding: "9px 10px",
  border: "none",
  background: "none",
  cursor: "pointer",
  borderRadius: 7,
  textAlign: "left",
};
const pendingWrap: React.CSSProperties = {
  marginTop: 30,
  padding: "16px 18px",
  background: "var(--bg-sunken)",
  border: "1px solid var(--border-subtle)",
  borderLeft: "2px solid var(--accent-action)",
  borderRadius: 12,
};
const pendingChip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  color: "var(--text-body)",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "6px 11px",
  cursor: "pointer",
};
const empty: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 40,
};
const kbd: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--bg-input)",
  padding: "1px 6px",
  borderRadius: 4,
  color: "var(--text-muted)",
};

function inspBtn(active: boolean): React.CSSProperties {
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

function titleStyle(isEmpty: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    background: "transparent",
    fontFamily: "var(--font-sans)",
    fontSize: 32,
    fontWeight: 600,
    letterSpacing: "-0.022em",
    lineHeight: 1.14,
    marginBottom: 12,
    color: isEmpty ? "var(--text-ghost)" : "var(--text-strong)",
    padding: 0,
    display: "block",
  };
}
