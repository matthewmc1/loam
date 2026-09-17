import { useMemo } from "react";
import type { Vault } from "../../store/vault";
import { useUI } from "../../store/ui";
import { useCadence } from "../../cadence/store";
import { liveNotes, reviewDue, activeContradiction } from "../../store/selectors";
import { openDailyNote } from "../../store/daily";
import { dayKey, lastActiveDay, narrate, startOfDay, type NarrativeLine } from "../../lib/narrative";
import { extractDecisions, type Decision } from "../../lib/decisions";
import { STATUS_COLOR, type Note } from "../../db/types";
import { relativeTime } from "../../lib/time";
import { EVENT_COLOR } from "../eventMeta";

const DAY = 86400000;

/**
 * Home. Not a dashboard of totals — a answer to "where was I, and what's
 * waiting on me?": the day's story, what's in motion, what's undecided.
 */
export function TodayView({ vault }: { vault: Vault }) {
  const { open, setView } = useUI();
  const now = Date.now();
  const today = startOfDay(now);
  const notes = useMemo(() => liveNotes(vault.notes), [vault.notes]);

  const story = useMemo(() => {
    const lines = narrate(vault.events, notes, today, today + DAY);
    if (lines.length) return { label: "Today so far", lines };
    const prev = lastActiveDay(vault.events, today);
    if (prev == null) return { label: "Today so far", lines };
    const label = prev === today - DAY ? "Yesterday" : new Date(prev).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    return { label: `Last time — ${label}`, lines: narrate(vault.events, notes, prev, prev + DAY) };
  }, [vault.events, notes, today]);

  const daily = notes.find((n) => n.title === dayKey(now));

  const active = useMemo(
    () => notes.filter((n) => now - n.updatedAt < 7 * DAY && n.id !== daily?.id).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [notes, now, daily?.id]
  );

  const openDecisions = useMemo(() => {
    const out: { note: Note; decision: Decision }[] = [];
    for (const n of notes) for (const d of extractDecisions(n.doc)) if (d.status === "open") out.push({ note: n, decision: d });
    return out;
  }, [notes]);

  const due = notes.filter((n) => reviewDue(n, now)).length;
  const contradictions = notes.filter((n) => activeContradiction(vault.events, n.id)).length;
  const inbox = notes.filter((n) => n.type === "Fleeting" && n.id !== daily?.id && n.source !== "journal").length;

  const cadence = useCadence();
  const focus = cadence.status === "connected" || cadence.status === "offline" ? cadence.tasks.filter((t) => t.status === "focus").slice(0, 5) : [];

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={page} className="loam-viewpage">
        <div className="uno" style={{ marginBottom: 8 }}>
          {new Date(now).toLocaleDateString(undefined, { weekday: "long" })}
        </div>
        <h1 style={h1}>{new Date(now).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</h1>

        {/* the day's story */}
        <section style={section}>
          <div style={sectionHead}>
            <span className="uno">{story.label}</span>
          </div>
          {story.lines.length === 0 ? (
            <p style={quiet}>Nothing yet. The first note of the day starts the story.</p>
          ) : (
            <ul style={storyList}>
              {story.lines.map((l, i) => (
                <StoryLine key={i} line={l} onOpen={open} />
              ))}
            </ul>
          )}
          <button className="rw" style={dailyBtn} onClick={() => void openDailyNote().then(open)}>
            <span style={{ fontWeight: 500, color: "var(--text-strong)" }}>{daily ? "Continue today’s note" : "Write today’s note"}</span>
            <span style={dailyExcerpt}>{daily?.text.trim() ? daily.text.trim().slice(0, 90) : "A page for the day — thoughts, links, loose ends."}</span>
            <span style={{ marginLeft: "auto", color: "var(--text-fainter)" }}>→</span>
          </button>
        </section>

        {/* needs you */}
        {(due > 0 || contradictions > 0 || inbox > 0) && (
          <section style={section}>
            <div style={sectionHead}>
              <span className="uno">Waiting on you</span>
            </div>
            <div style={chips}>
              {contradictions > 0 && <Chip n={contradictions} label={contradictions === 1 ? "contradiction" : "contradictions"} color="var(--danger)" onClick={() => setView("resurface")} />}
              {due > 0 && <Chip n={due} label="due for review" color="var(--status-review)" onClick={() => setView("resurface")} />}
              {inbox > 0 && <Chip n={inbox} label={inbox === 1 ? "fleeting note to process" : "fleeting notes to process"} color="var(--status-fleeting)" onClick={() => setView("resurface")} />}
            </div>
          </section>
        )}

        {openDecisions.length > 0 && (
          <section style={section}>
            <div style={sectionHead}>
              <span className="uno">Open decisions</span>
              <span style={count}>{openDecisions.length}</span>
            </div>
            {openDecisions.map(({ note, decision }) => (
              <button key={note.id + decision.id} className="rw" style={row} onClick={() => open(note.id)}>
                <span style={{ ...dot, background: "var(--status-review)" }} />
                <span style={rowMain}>{decision.statement}</span>
                <span style={rowMeta}>{note.title}</span>
              </button>
            ))}
          </section>
        )}

        {focus.length > 0 && (
          <section style={section}>
            <div style={sectionHead}>
              <span className="uno">In focus · Cadence</span>
            </div>
            {focus.map((t) => (
              <div key={t.id} style={{ ...row, cursor: "default" }}>
                <span style={{ ...dot, borderRadius: 2, background: "var(--text-strong)" }} />
                <span style={rowMain}>{t.title}</span>
                {t.pending && <span style={rowMeta}>queued</span>}
              </div>
            ))}
          </section>
        )}

        <section style={section}>
          <div style={sectionHead}>
            <span className="uno">In motion</span>
            <span style={count}>last 7 days</span>
          </div>
          {active.length === 0 ? (
            <p style={quiet}>Nothing touched this week.</p>
          ) : (
            active.map((n) => (
              <button key={n.id} className="rw" style={row} onClick={() => open(n.id)}>
                <span style={{ ...dot, background: STATUS_COLOR[n.status] }} />
                <span style={rowMain}>{n.title}</span>
                <span style={rowMeta}>{relativeTime(n.updatedAt, now)}</span>
              </button>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function StoryLine({ line, onOpen }: { line: NarrativeLine; onOpen: (id: string) => void }) {
  return (
    <li style={storyItem}>
      <span style={{ ...dot, marginTop: 9, background: EVENT_COLOR[line.kind] }} />
      <span>
        {line.parts.map((p, i) =>
          typeof p === "string" ? (
            <span key={i}>{p}</span>
          ) : (
            <button key={i} className="lk" style={noteLink} onClick={() => onOpen(p.noteId)}>
              {p.title}
            </button>
          )
        )}
        .
      </span>
    </li>
  );
}

function Chip({ n, label, color, onClick }: { n: number; label: string; color: string; onClick: () => void }) {
  return (
    <button className="rw" style={chip} onClick={onClick}>
      <span style={{ ...dot, background: color }} />
      <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{n}</span>
      <span>{label}</span>
    </button>
  );
}

/* -------------------------------- styles -------------------------------- */

const page: React.CSSProperties = { maxWidth: "var(--editor-max)", margin: "0 auto", padding: "52px 40px 100px" };
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15 };
const section: React.CSSProperties = { marginTop: 38 };
const sectionHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingBottom: 10,
  marginBottom: 8,
  borderBottom: "1px solid var(--border-subtle)",
};
const count: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-fainter)" };
const quiet: React.CSSProperties = { fontSize: 14, color: "var(--text-ghost)", padding: "6px 0" };
const storyList: React.CSSProperties = { listStyle: "none", display: "flex", flexDirection: "column", gap: 4, padding: "4px 0 2px" };
const storyItem: React.CSSProperties = { display: "flex", gap: 12, fontSize: 16, lineHeight: 1.6, color: "var(--text-body)" };
const noteLink: React.CSSProperties = {
  font: "inherit",
  fontWeight: 470,
  color: "var(--text-strong)",
  background: "var(--link-bg)",
  border: "none",
  borderBottom: "1px solid var(--link-border)",
  borderRadius: "0.32em",
  padding: "0.02em 0.32em 0.04em",
  cursor: "pointer",
};
const dot: React.CSSProperties = { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 };
const dailyBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  width: "100%",
  marginTop: 14,
  padding: "12px 14px",
  border: "1px dashed var(--border-strong)",
  borderRadius: "var(--r-lg)",
  background: "none",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
};
const dailyExcerpt: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  color: "var(--text-muted)",
  fontSize: 13,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const chips: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 };
const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "6px 12px",
  border: "1px solid var(--border)",
  borderRadius: 20,
  background: "var(--bg-sidebar)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  color: "var(--text-600)",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  width: "100%",
  padding: "8px 8px",
  border: "none",
  borderRadius: 7,
  background: "none",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "var(--font-sans)",
};
const rowMain: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 14.5,
  color: "var(--text-body)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const rowMeta: React.CSSProperties = {
  flexShrink: 0,
  maxWidth: "40%",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-fainter)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
