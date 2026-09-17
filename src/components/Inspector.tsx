import { useEffect, useState } from "react";
import type { Vault } from "../store/vault";
import { useNoteEvents, useEventCount } from "../store/vault";
import { useUI } from "../store/ui";
import {
  connectionsOf,
  suggestedLinks,
  activeContradiction,
  outboundIds,
  backlinksOf,
  linkMetaBetween,
} from "../store/selectors";
import { useAi } from "../ai/store";
import { topNeighbors } from "../ai/vectors";
import { SUGGEST_THRESHOLD, TOP_K } from "../ai/config";
import {
  setType,
  setStatus,
  setSource,
  setConfidence,
  setReviewInterval,
  setAliases,
  setProperties,
  verifyNote,
  markReviewed,
  moveNote,
  linkNotes,
  unlinkNotes,
  archiveNote,
  deleteNoteForever,
  resolveContradiction,
} from "../store/notes";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  NOTE_STATUSES,
  NOTE_TYPES,
  REVIEW_INTERVALS,
  type Note,
  type NoteProperty,
  type LinkMeta,
} from "../db/types";
import { relativeTime, shortDate } from "../lib/time";
import { Menu, MenuItem } from "./ui/Menu";
import { CloseIcon } from "./icons";
import { EVENT_COLOR } from "./eventMeta";
import { Sources, sourceCount as countSources } from "./Sources";
import { isUrl, normalizeUrl } from "../lib/url";

const PROV_LIMIT = 10;

export function Inspector({ note, vault }: { note: Note; vault: Vault }) {
  const { open } = useUI();
  const events = useNoteEvents(note.id, PROV_LIMIT);
  const eventCount = useEventCount(note.id);
  const [showHistory, setShowHistory] = useState(false);
  const connections = connectionsOf(vault.notes, note);
  const contradiction = activeContradiction(vault.events, note.id);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const aiVectors = useAi((s) => s.vectors);
  const aiLlm = useAi((s) => s.llm);
  const analyzing = useAi((s) => s.analyzing);

  const live = vault.notes.filter((n) => !n.archivedAt);

  // Prefer embedding-based suggestions; fall back to the keyword heuristic.
  const semantic = aiVectors.has(note.id)
    ? (() => {
        const connected = new Set([
          note.id,
          ...outboundIds(note),
          ...backlinksOf(vault.notes, note.id).map((n) => n.id),
        ]);
        return topNeighbors(aiVectors, note.id, live, TOP_K, SUGGEST_THRESHOLD)
          .filter((n) => !connected.has(n.note.id))
          .slice(0, 3)
          .map((n) => ({ note: n.note, conf: n.score }));
      })()
    : null;

  const isSemantic = !!semantic && semantic.length > 0;
  const suggestions = (isSemantic ? semantic! : suggestedLinks(live, note, 3)).filter(
    (s) => !dismissed.has(s.note.id)
  );

  // any note not already connected (and not self) can be linked manually
  const connectedIds = new Set([note.id, ...connections.map((c) => c.note.id)]);
  const linkable = live
    .filter((n) => !connectedIds.has(n.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <aside style={aside}>
      {/* properties */}
      <SectionLabel>Properties</SectionLabel>
      <div style={{ padding: "0 12px 12px" }}>
        <PropRow label="type">
          <Menu
            width={180}
            trigger={({ toggle }) => (
              <button style={valueBtn} onClick={toggle}>
                {note.type}
              </button>
            )}
          >
            {(close) =>
              NOTE_TYPES.map((t) => (
                <MenuItem key={t} active={t === note.type} onClick={() => { void setType(note.id, t); close(); }}>
                  {t}
                </MenuItem>
              ))
            }
          </Menu>
        </PropRow>

        <PropRow label="status">
          <Menu
            width={180}
            trigger={({ toggle }) => (
              <button style={{ ...valueBtn, display: "flex", alignItems: "center", gap: 7 }} onClick={toggle}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[note.status] }} />
                {STATUS_LABEL[note.status]}
              </button>
            )}
          >
            {(close) =>
              NOTE_STATUSES.map((s) => (
                <MenuItem key={s} dot={STATUS_COLOR[s]} active={s === note.status} onClick={() => { void setStatus(note.id, s); close(); }}>
                  {STATUS_LABEL[s]}
                </MenuItem>
              ))
            }
          </Menu>
        </PropRow>

        <PropRow label="folder">
          <Menu
            width={200}
            trigger={({ toggle }) => (
              <button style={valueBtn} onClick={toggle}>
                {vault.folders.find((f) => f.id === note.folderId)?.name ?? "Unfiled"}
              </button>
            )}
          >
            {(close) => (
              <>
                {vault.folders
                  .filter((f) => !f.archivedAt)
                  .map((f) => (
                    <MenuItem
                      key={f.id}
                      dot={f.color}
                      active={f.id === note.folderId}
                      onClick={() => {
                        void moveNote(note.id, f.id);
                        close();
                      }}
                    >
                      {f.name}
                    </MenuItem>
                  ))}
                <MenuItem
                  active={!note.folderId}
                  onClick={() => {
                    void moveNote(note.id, null);
                    close();
                  }}
                >
                  Unfiled
                </MenuItem>
              </>
            )}
          </Menu>
        </PropRow>

        <PropRow label="source">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <EditableText value={note.source} placeholder="—" onCommit={(v) => void setSource(note.id, v)} />
            {isUrl(note.source) && (
              <a
                href={normalizeUrl(note.source) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                title="Open source"
                aria-label="Open source"
                style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: 13, flexShrink: 0 }}
              >
                ↗
              </a>
            )}
          </span>
        </PropRow>

        <PropRow label="confidence">
          <Confidence value={note.confidence} onSet={(v) => void setConfidence(note.id, v)} />
        </PropRow>

        <PropRow label="review">
          <Menu
            width={180}
            trigger={({ toggle }) => (
              <button style={valueBtn} onClick={toggle} title="Spaced-review cycle">
                {note.reviewInterval != null ? `every ${note.reviewInterval}d` : "off"}
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem active={note.reviewInterval == null} onClick={() => { void setReviewInterval(note.id, null); close(); }}>
                  Off
                </MenuItem>
                {REVIEW_INTERVALS.map((d) => (
                  <MenuItem key={d} active={d === note.reviewInterval} onClick={() => { void setReviewInterval(note.id, d); close(); }}>
                    every {d}d
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        </PropRow>

        <PropRow label="reviewed">
          <button style={valueBtn} onClick={() => void markReviewed(note.id)} title="Mark reviewed now — resets the review clock">
            {note.lastReviewedAt ? relativeTime(note.lastReviewedAt) : "—"}
          </button>
        </PropRow>

        <PropRow label="verified">
          <button style={valueBtn} onClick={() => void verifyNote(note.id)} title="Mark verified now">
            {note.verifiedAt ? relativeTime(note.verifiedAt) : "—"}
          </button>
        </PropRow>

        <PropRow label="aliases">
          <EditableText
            value={(note.aliases ?? []).join(", ")}
            placeholder="—"
            onCommit={(v) => void setAliases(note.id, v.split(","))}
          />
        </PropRow>

        <PropRow label="created">
          <span style={valueText}>{shortDate(note.createdAt)}</span>
        </PropRow>

        <PropRow label="id">
          <span style={{ ...valueText, fontFamily: "var(--font-mono)", fontSize: 11 }}>{note.zid}</span>
        </PropRow>

        <CustomProps note={note} />
      </div>

      {/* connections */}
      <SectionLabel>Connections · {connections.length}</SectionLabel>
      <div style={{ padding: "0 12px 12px" }}>
        {connections.length === 0 && <Hint>No connections yet.</Hint>}
        {connections.map((c) => (
          <ConnRow
            key={c.note.id}
            dir={c.dir}
            note={c.note}
            meta={linkMetaBetween(note, c.note)}
            removable={c.dir !== "←" && note.manualLinks.includes(c.note.id)}
            onOpen={() => open(c.note.id)}
            onUnlink={() => void unlinkNotes(note.id, c.note.id)}
          />
        ))}
        <AddLink candidates={linkable} onLink={(id) => void linkNotes(note.id, id)} />
      </div>

      {/* external sources & material */}
      <SectionLabel>Sources · {countSources(note)}</SectionLabel>
      <Sources note={note} />

      {/* AI */}
      <div style={aiHeader}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-strong)" }} className="pulse-dot" />
        <span className="uno">Loam</span>
      </div>
      <div style={{ padding: "0 12px 14px" }}>
        {contradiction && (
          <div style={{ display: "flex", gap: 9, marginBottom: 14 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)", flexShrink: 0, marginTop: 5 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", marginBottom: 2 }}>
                Possible contradiction
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-600)", lineHeight: 1.5 }}>{contradiction}</div>
              <button style={resolveBtn} onClick={() => void resolveContradiction(note.id)}>
                Mark resolved
              </button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          Suggested links
          {isSemantic && <span style={semanticTag}>semantic</span>}
        </div>
        {suggestions.length === 0 && <Hint>Nothing to suggest right now.</Hint>}
        {suggestions.map((s) => (
          <div key={s.note.id} style={suggestRow} className="rw">
            <button style={suggestMain} onClick={() => open(s.note.id)}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: STATUS_COLOR[s.note.status] }} />
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.note.title}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-fainter)" }}>
                {/* only semantic scores are real percentages; the heuristic isn't one */}
                {isSemantic ? `${Math.round(s.conf * 100)}%` : "related"}
              </span>
            </button>
            <button
              style={acceptBtn}
              title="Link them"
              onClick={() =>
                void linkNotes(note.id, s.note.id, {
                  type: "related",
                  rationale: isSemantic
                    ? `${Math.round(s.conf * 100)}% semantic similarity`
                    : "shared tags / neighbors",
                  origin: "suggestion",
                })
              }
            >
              Link
            </button>
            <button
              style={dismissX}
              title="Dismiss"
              onClick={() => setDismissed((d) => new Set(d).add(s.note.id))}
            >
              <CloseIcon size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* concepts & relations (Gemma) */}
      <ConceptsSection
        note={note}
        llmReady={aiLlm === "ready"}
        analyzing={analyzing.has(note.id)}
        connectedIds={connectedIds}
        onOpen={open}
      />

      {/* provenance */}
      <SectionLabel>
        Provenance{eventCount > 0 ? ` · ${eventCount}` : ""}
      </SectionLabel>
      <div style={{ padding: "2px 12px 26px" }}>
        <ProvenanceTimeline events={events} />
        {/* only when the inline list is actually full — avoids a flash from a
            stale count while two live queries settle on note switch */}
        {events.length >= PROV_LIMIT && eventCount > events.length && (
          <button style={historyBtn} className="rw" onClick={() => setShowHistory(true)}>
            View full history ({eventCount}) →
          </button>
        )}
      </div>

      {/* archive — soft-delete; the full history survives */}
      <div style={{ padding: "0 12px 26px", display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          style={archiveBtn}
          className="rw"
          title="Hide from the vault — restore anytime from Archive"
          onClick={() => void archiveNote(note.id)}
        >
          Archive note
        </button>
        <button
          style={deleteBtn}
          className="rw"
          title="Erase this note and its entire history — cannot be undone"
          onClick={() => {
            const ok = window.confirm(
              `Delete “${note.title}” forever?\n\nThis erases the note AND its full provenance history. ` +
                `Wikilinks pointing here become pending mentions. This cannot be undone — Archive is the reversible option.`
            );
            if (ok) void deleteNoteForever(note.id);
          }}
        >
          Delete forever…
        </button>
      </div>

      {showHistory && (
        <ProvenanceDialog noteId={note.id} title={note.title} total={eventCount} onClose={() => setShowHistory(false)} />
      )}
    </aside>
  );
}

/* ------------------------------ provenance ------------------------------ */

function ProvenanceTimeline({ events }: { events: { id: string; ts: number; kind: string; summary: string }[] }) {
  return (
    <>
      {events.map((e) => (
        <div key={e.id} style={provRow}>
          <span style={{ color: "var(--text-fainter)", width: 40, flexShrink: 0 }}>
            {relativeTime(e.ts).replace(" ago", "")}
          </span>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: EVENT_COLOR[e.kind as keyof typeof EVENT_COLOR] ?? "var(--text-fainter)", flexShrink: 0, marginTop: 6 }} />
          <span style={{ flex: 1 }}>{e.summary}</span>
        </div>
      ))}
    </>
  );
}

function ProvenanceDialog({
  noteId,
  title,
  total,
  onClose,
}: {
  noteId: string;
  title: string;
  total: number;
  onClose: () => void;
}) {
  const all = useNoteEvents(noteId); // full history, fetched only on demand
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={histBackdrop} onMouseDown={onClose}>
      <div style={histPanel} role="dialog" aria-modal="true" aria-label={`History of ${title}`} onMouseDown={(e) => e.stopPropagation()}>
        <div style={histHead}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>Full history</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
              {title} · {total} changes
            </div>
          </div>
          <button style={histClose} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 16px 16px" }}>
          <ProvenanceTimeline events={all} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ custom props ---------------------------- */

function CustomProps({ note }: { note: Note }) {
  const update = (props: NoteProperty[]) => void setProperties(note.id, props);
  return (
    <>
      {note.properties.map((p, i) => (
        <div key={i} className="pr" style={propRow}>
          <EditableText
            value={p.key}
            placeholder="key"
            mono
            onCommit={(v) => update(note.properties.map((x, j) => (j === i ? { ...x, key: v } : x)))}
          />
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <EditableText
              value={p.value}
              placeholder="value"
              onCommit={(v) => update(note.properties.map((x, j) => (j === i ? { ...x, value: v } : x)))}
            />
            <button
              style={dismissX}
              title="Remove"
              onClick={() => update(note.properties.filter((_, j) => j !== i))}
            >
              <CloseIcon size={10} />
            </button>
          </div>
        </div>
      ))}
      <button
        className="pr"
        style={addPropBtn}
        onClick={() => update([...note.properties, { key: "", value: "" }])}
      >
        <span style={{ width: 78, flexShrink: 0, textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11 }}>
          + add
        </span>
        <span>property</span>
      </button>
    </>
  );
}

/* ------------------------------ add link -------------------------------- */

function AddLink({
  candidates,
  onLink,
}: {
  candidates: Note[];
  onLink: (id: string) => void;
}) {
  const [active, setActive] = useState(false);
  const [q, setQ] = useState("");
  const listId = "loam-linkable";

  const commit = (value: string) => {
    const match = candidates.find((n) => n.title.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      onLink(match.id);
      setQ("");
      setActive(false);
    }
  };

  if (!active) {
    return (
      <button
        className="rw"
        style={addLinkBtn}
        disabled={candidates.length === 0}
        onClick={() => setActive(true)}
        title={candidates.length === 0 ? "Everything is already linked" : "Link this note to another"}
      >
        + link a note
      </button>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <input
        autoFocus
        list={listId}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          // selecting a datalist option fires change with the full title
          if (candidates.some((n) => n.title === e.target.value)) commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(q);
          } else if (e.key === "Escape") {
            setActive(false);
            setQ("");
          }
        }}
        onBlur={() => {
          setActive(false);
          setQ("");
        }}
        placeholder="Search a note to link…"
        aria-label="Search a note to link"
        style={addLinkInput}
      />
      <datalist id={listId}>
        {candidates.slice(0, 50).map((n) => (
          <option key={n.id} value={n.title} />
        ))}
      </datalist>
    </div>
  );
}

/* -------------------------- concepts & relations ------------------------ */

const REL_COLOR: Record<string, string> = {
  supports: "var(--status-verified)",
  contradicts: "var(--danger)",
  extends: "var(--text-600)",
  refines: "var(--text-600)",
  related: "var(--text-muted)",
};

function ConceptsSection({
  note,
  llmReady,
  analyzing,
  connectedIds,
  onOpen,
}: {
  note: Note;
  llmReady: boolean;
  analyzing: boolean;
  connectedIds: Set<string>;
  onOpen: (id: string) => void;
}) {
  const analyzeNote = useAi((s) => s.analyzeNote);
  const setPanel = useAi((s) => s.setPanel);
  const concepts = note.aiConcepts ?? [];
  const relations = note.aiRelations ?? [];

  return (
    <>
      <SectionLabel>Concepts &amp; relations</SectionLabel>
      <div style={{ padding: "0 12px 16px" }}>
        {concepts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: relations.length ? 12 : 10 }}>
            {concepts.map((c) => (
              <span key={c} style={conceptChip}>
                {c}
              </span>
            ))}
          </div>
        )}
        {relations.map((r, i) => {
          const linked = !!r.targetId && connectedIds.has(r.targetId);
          return (
            <div key={i} className="rw" style={{ display: "flex", alignItems: "center", borderRadius: 6, paddingRight: 6 }}>
              <button
                style={{ ...relRow, flex: 1, minWidth: 0 }}
                onClick={() => r.targetId && onOpen(r.targetId)}
                disabled={!r.targetId}
              >
                <span style={{ ...relType, color: REL_COLOR[r.type], borderColor: REL_COLOR[r.type] }}>
                  {r.type}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.target}
                  </span>
                  {r.rationale && (
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.rationale}
                    </span>
                  )}
                </span>
              </button>
              {/* accepting a relation persists it as a typed link — the AI's
                  rationale becomes part of the vault's memory, not just display */}
              {r.targetId &&
                (linked ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-verified-soft)", flexShrink: 0 }}>✓</span>
                ) : (
                  <button
                    style={acceptBtn}
                    title={`Link as “${r.type}”`}
                    onClick={() =>
                      void linkNotes(note.id, r.targetId!, {
                        type: r.type,
                        rationale: r.rationale,
                        origin: "ai",
                      })
                    }
                  >
                    Link
                  </button>
                ))}
            </div>
          );
        })}
        {concepts.length === 0 && relations.length === 0 && (
          <Hint>{note.aiAnalyzedAt ? "No concepts found." : "Not analyzed yet."}</Hint>
        )}
        <button style={analyzeBtn} disabled={analyzing} onClick={() => (llmReady ? void analyzeNote(note.id) : setPanel(true))}>
          {analyzing
            ? "Analyzing…"
            : llmReady
              ? note.aiAnalyzedAt
                ? "Re-analyze with Gemma"
                : "Analyze with Gemma"
              : "Load a model to analyze →"}
        </button>
      </div>
    </>
  );
}

/* ------------------------------- bits ----------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="uno" style={{ padding: "16px 18px 6px", borderTop: "1px solid var(--border-subtle)" }}>
      {children}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pr" style={propRow}>
      <span style={propKey}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--text-ghost)", padding: "2px 8px" }}>{children}</div>;
}

function ConnRow({
  dir,
  note,
  meta,
  removable,
  onOpen,
  onUnlink,
}: {
  dir: "→" | "←" | "↔";
  note: Note;
  meta?: LinkMeta;
  removable: boolean;
  onOpen: () => void;
  onUnlink: () => void;
}) {
  const dirTitle = dir === "↔" ? "Mutual link" : dir === "→" ? "Links out to" : "Links in from";
  return (
    <div className="rw" style={connRow}>
      <button style={connMain} onClick={onOpen} title={meta?.rationale}>
        <span
          title={dirTitle}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: dir === "↔" ? "var(--status-verified-soft)" : "var(--text-fainter)",
            width: 14,
            flexShrink: 0,
          }}
        >
          {dir}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: STATUS_COLOR[note.status] }} />
        <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {note.title}
        </span>
        {meta && meta.type !== "related" && (
          <span style={{ ...relType, color: REL_COLOR[meta.type], borderColor: REL_COLOR[meta.type] }}>
            {meta.type}
          </span>
        )}
      </button>
      {removable && (
        <button style={dismissX} title="Unlink" onClick={onUnlink}>
          <CloseIcon size={10} />
        </button>
      )}
    </div>
  );
}

function EditableText({
  value,
  placeholder,
  mono,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  mono?: boolean;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (v !== value) onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setV(value);
            setEditing(false);
          }
        }}
        style={{
          ...valueText,
          width: "100%",
          border: "1px solid var(--border)",
          borderRadius: 5,
          padding: "2px 6px",
          background: "var(--bg-main)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          outline: "none",
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        ...valueText,
        cursor: "text",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        color: value ? "var(--text-body)" : "var(--text-ghost)",
        display: "inline-block",
        minWidth: 40,
        background: "none",
        border: "none",
        padding: 0,
        textAlign: "left",
      }}
    >
      {value || placeholder}
    </button>
  );
}

function Confidence({ value, onSet }: { value: number; onSet: (v: number) => void }) {
  const filled = Math.round(value * 5);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ display: "flex", gap: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <button
            key={i}
            onClick={() => onSet((i + 1) / 5)}
            title={`Set confidence ${(i + 1) * 20}%`}
            style={{
              width: 14,
              height: 8,
              padding: 0,
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              background: i < filled ? "var(--text-strong)" : "var(--border)",
            }}
          />
        ))}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-500)" }}>
        {value.toFixed(2)}
      </span>
    </span>
  );
}

/* -------------------------------- styles -------------------------------- */

const aside: React.CSSProperties = {
  width: "var(--inspector-w)",
  flexShrink: 0,
  borderLeft: "1px solid var(--border)",
  background: "var(--bg-sidebar)",
  overflowY: "auto",
};
const propRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "7px 8px",
  borderRadius: 6,
  minHeight: 31,
};
const propKey: React.CSSProperties = {
  width: 78,
  flexShrink: 0,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-faint)",
};
const valueText: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-body)",
};
const valueBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  fontSize: 12.5,
  color: "var(--text-body)",
  fontFamily: "var(--font-sans)",
  padding: 0,
  textAlign: "left",
};
const addPropBtn: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  width: "100%",
  padding: "7px 8px",
  border: "none",
  background: "none",
  cursor: "pointer",
  borderRadius: 6,
  color: "var(--text-fainter)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
};
const aiHeader: React.CSSProperties = {
  borderTop: "1px solid var(--border-subtle)",
  padding: "14px 18px 8px",
  display: "flex",
  alignItems: "center",
  gap: 7,
};
const resolveBtn: React.CSSProperties = {
  marginTop: 8,
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-strong)",
  borderBottom: "1px solid var(--border-strong)",
  fontFamily: "var(--font-sans)",
};
const connRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderRadius: 6,
};
const connMain: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
  padding: "7px 8px",
  border: "none",
  background: "none",
  cursor: "pointer",
  textAlign: "left",
};
const suggestRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderRadius: 6,
  paddingRight: 6,
};
const suggestMain: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  flex: 1,
  minWidth: 0,
  padding: "6px 6px",
  border: "none",
  background: "none",
  cursor: "pointer",
  textAlign: "left",
};
const acceptBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  cursor: "pointer",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-600)",
  fontFamily: "var(--font-sans)",
};
const dismissX: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-fainter)",
  borderRadius: 4,
  flexShrink: 0,
};
const semanticTag: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--status-verified-soft)",
  background: "var(--link-bg)",
  border: "1px solid var(--link-border)",
  borderRadius: 4,
  padding: "0 5px",
};
const conceptChip: React.CSSProperties = {
  fontSize: 11.5,
  fontFamily: "var(--font-mono)",
  color: "var(--text-600)",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "2px 8px",
};
const relRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  width: "100%",
  padding: "7px 8px",
  border: "none",
  background: "none",
  cursor: "pointer",
  borderRadius: 6,
  textAlign: "left",
};
const relType: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9.5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  border: "1px solid",
  borderRadius: 4,
  padding: "1px 5px",
  flexShrink: 0,
  marginTop: 1,
};
const analyzeBtn: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  color: "var(--text-600)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const addLinkBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
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
const addLinkInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-input)",
  borderRadius: 7,
  padding: "6px 9px",
  outline: "none",
  fontSize: 12.5,
  fontFamily: "var(--font-sans)",
  color: "var(--text-body)",
};
const archiveBtn: React.CSSProperties = {
  width: "100%",
  border: "1px dashed var(--border-strong)",
  background: "none",
  color: "var(--text-faint)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 11.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const deleteBtn: React.CSSProperties = {
  ...archiveBtn,
  borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)",
  color: "var(--danger)",
};
const historyBtn: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  color: "var(--text-muted)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 11.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  textAlign: "left",
};
const histBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#1b1b1818",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "9vh",
  zIndex: 200,
};
const histPanel: React.CSSProperties = {
  width: 480,
  maxWidth: "92vw",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-sidebar)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "0 24px 60px -16px #1b1b1840, 0 4px 12px #1b1b1818",
  overflow: "hidden",
  animation: "fadeUp .14s var(--ease)",
};
const histHead: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  padding: "15px 16px 11px",
  borderBottom: "1px solid var(--border-subtle)",
};
const histClose: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-faint)",
  borderRadius: 6,
};
const provRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-muted)",
  padding: "5px 0",
  lineHeight: 1.4,
};
