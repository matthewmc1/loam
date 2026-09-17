/**
 * The daily narrative — a plain-language account of what happened in the
 * vault on a given day, written from the provenance log. Deterministic on
 * purpose: it is a record, so it must say the same thing every time and work
 * with no model loaded. (A local LLM can polish the wording later; it should
 * never be the source of the facts.)
 */
import type { EventKind, Note, ProvenanceEvent } from "../db/types";

/** A sentence, as parts — so a note's title can render as a link to it. */
export type Part = string | { noteId: string; title: string };

export interface NarrativeLine {
  /** drives the dot colour beside the line */
  kind: EventKind;
  parts: Part[];
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "2026-09-17" in local time — the title of that day's note. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The most recent day before `before` that has any events, or null. */
export function lastActiveDay(events: ProvenanceEvent[], before: number): number | null {
  let latest = -Infinity;
  for (const e of events) if (e.ts < before && e.ts > latest) latest = e.ts;
  return latest === -Infinity ? null : startOfDay(latest);
}

const MAX_NAMED = 3;

/** "A, B and C" / "A, B, C and 2 more" — as parts, each title linkable. */
function nameNotes(ids: string[], notes: Map<string, Note>): Part[] {
  const known = ids.map((id) => notes.get(id)).filter((n): n is Note => !!n);
  const named = known.slice(0, MAX_NAMED);
  const rest = ids.length - named.length;
  const parts: Part[] = [];
  named.forEach((n, i) => {
    if (i > 0) parts.push(i === named.length - 1 && rest === 0 ? " and " : ", ");
    parts.push({ noteId: n.id, title: n.title });
  });
  if (rest > 0) parts.push(named.length ? ` and ${rest} more` : `${rest} ${rest === 1 ? "note" : "notes"}`);
  return parts;
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * What happened between `from` and `to`, most meaningful first: what was
 * decided and made, then what was connected and checked, then upkeep.
 */
export function narrate(events: ProvenanceEvent[], notes: Note[], from: number, to: number): NarrativeLine[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const day = events.filter((e) => e.ts >= from && e.ts < to).sort((a, b) => a.ts - b.ts);
  const of = (...kinds: EventKind[]) => day.filter((e) => kinds.includes(e.kind));
  const lines: NarrativeLine[] = [];

  // decisions — the summary already reads as a sentence: decision decided: “…”
  // a decision flipped back and forth during the day is reported once, as it ended up
  const lastPerDecision = new Map<string, ProvenanceEvent>();
  for (const e of of("decision_changed")) lastPerDecision.set(String(e.data?.decisionId ?? e.id), e);
  for (const e of lastPerDecision.values()) {
    const to_ = String(e.data?.to ?? "");
    const statement = /“(.*)”/.exec(e.summary)?.[1] ?? "a decision";
    const verb = to_ === "decided" ? "Decided" : to_ === "reversed" ? "Reversed" : "Reopened";
    const note = byId.get(e.noteId);
    lines.push({
      kind: "decision_changed",
      parts: [`${verb} “${statement}”`, ...(note ? [" in ", { noteId: note.id, title: note.title }] : [])],
    });
  }

  const created = uniq(of("created", "split_from", "derived_from", "clipped_from").map((e) => e.noteId)).filter((id) => byId.has(id));
  if (created.length)
    lines.push({ kind: "created", parts: [`Started ${plural(created.length, "note")}: `, ...nameNotes(created, byId)] });

  const edited = uniq(of("edited", "renamed").map((e) => e.noteId)).filter((id) => byId.has(id) && !created.includes(id));
  if (edited.length) lines.push({ kind: "edited", parts: ["Worked on ", ...nameNotes(edited, byId)] });

  const links = of("linked").filter((e) => e.relatedNoteId && byId.has(e.noteId) && byId.has(e.relatedNoteId));
  if (links.length === 1) {
    const [l] = links;
    lines.push({
      kind: "linked",
      parts: ["Connected ", { noteId: l.noteId, title: byId.get(l.noteId)!.title }, " → ", { noteId: l.relatedNoteId!, title: byId.get(l.relatedNoteId!)!.title }],
    });
  } else if (links.length > 1) {
    lines.push({ kind: "linked", parts: [`Made ${links.length} connections, across `, ...nameNotes(uniq(links.map((l) => l.noteId)), byId)] });
  }

  const verified = uniq(of("verified").map((e) => e.noteId)).filter((id) => byId.has(id));
  if (verified.length) lines.push({ kind: "verified", parts: ["Verified ", ...nameNotes(verified, byId)] });

  const reviewed = uniq(of("reviewed").map((e) => e.noteId)).filter((id) => byId.has(id));
  if (reviewed.length) lines.push({ kind: "reviewed", parts: ["Reviewed ", ...nameNotes(reviewed, byId)] });

  const flagged = uniq(of("contradiction_flagged").map((e) => e.noteId)).filter((id) => byId.has(id));
  if (flagged.length) lines.push({ kind: "contradiction_flagged", parts: ["A contradiction surfaced in ", ...nameNotes(flagged, byId)] });
  const resolved = uniq(of("contradiction_resolved").map((e) => e.noteId)).filter((id) => byId.has(id));
  if (resolved.length) lines.push({ kind: "contradiction_resolved", parts: ["Resolved a contradiction in ", ...nameNotes(resolved, byId)] });

  const refs = of("ref_added");
  if (refs.length) lines.push({ kind: "ref_added", parts: [`Cited ${plural(refs.length, "source")} in `, ...nameNotes(uniq(refs.map((e) => e.noteId)), byId)] });

  const made = of("task_created").length;
  const done = of("task_completed").length;
  if (made || done)
    lines.push({
      kind: done ? "task_completed" : "task_created",
      parts: [[made && `Sent ${plural(made, "task")} to Cadence`, done && `${made ? "closed" : "Closed"} ${plural(done, "task")}`].filter(Boolean).join(", ")],
    });

  const archived = of("archived").length;
  if (archived) lines.push({ kind: "archived", parts: [`Archived ${plural(archived, "note")}`] });

  return lines;
}
