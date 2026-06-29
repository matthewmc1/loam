import type { Note, Folder, ProvenanceEvent } from "../db/types";
import { daysSince, cadenceDays } from "../lib/time";

/** Union of prose-derived and manually-accepted outbound links. */
export function outboundIds(note: Note): string[] {
  return Array.from(new Set([...note.links, ...note.manualLinks]));
}

export function byId(notes: Note[]): Map<string, Note> {
  return new Map(notes.map((n) => [n.id, n]));
}

export function liveNotes(notes: Note[] | undefined): Note[] {
  return (notes ?? []).filter((n) => !n.archivedAt);
}

/** Notes that link *to* `id`. */
export function backlinksOf(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id && outboundIds(n).includes(id));
}

export interface Connection {
  /** → outbound only · ← inbound only · ↔ mutual (linked both ways) */
  dir: "→" | "←" | "↔";
  note: Note;
}

/**
 * Connections for the inspector: each connected note appears exactly once.
 * A mutual link (A→B and B→A) collapses into a single bidirectional entry
 * rather than showing up as both an outbound and an inbound row.
 */
export function connectionsOf(notes: Note[], note: Note): Connection[] {
  const map = byId(notes);
  const backIds = new Set(
    backlinksOf(notes, note.id)
      .filter((n) => !n.archivedAt)
      .map((n) => n.id)
  );

  const result: Connection[] = [];
  const seen = new Set<string>();

  // outbound (collapsing mutual links to ↔), preserving outbound order
  for (const id of outboundIds(note)) {
    if (seen.has(id)) continue;
    const n = map.get(id);
    if (!n || n.archivedAt) continue;
    seen.add(id);
    result.push({ dir: backIds.has(id) ? "↔" : "→", note: n });
  }

  // inbound-only (anything not already shown as → or ↔)
  for (const n of backlinksOf(notes, note.id)) {
    if (n.archivedAt || seen.has(n.id)) continue;
    seen.add(n.id);
    result.push({ dir: "←", note: n });
  }

  return result;
}

/**
 * Suggested links: notes not yet connected, ranked by shared tags and shared
 * neighbors (a cheap stand-in for the embedded AI's similarity).
 */
export interface Suggestion {
  note: Note;
  score: number;
  conf: number;
}

export function suggestedLinks(notes: Note[], note: Note, limit = 3): Suggestion[] {
  const connected = new Set([note.id, ...outboundIds(note), ...backlinksOf(notes, note.id).map((n) => n.id)]);
  const myTags = new Set(note.tags);
  const myNeighbors = new Set(outboundIds(note));

  const scored = notes
    .filter((n) => !n.archivedAt && !connected.has(n.id))
    .map((n) => {
      const sharedTags = n.tags.filter((t) => myTags.has(t)).length;
      const sharedNeighbors = outboundIds(n).filter((x) => myNeighbors.has(x)).length;
      const score = sharedTags * 2 + sharedNeighbors;
      return { note: n, score };
    })
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, limit);

  return scored.map((s, i) => ({
    ...s,
    conf: Math.max(0.4, 0.72 - i * 0.09 + Math.min(0.2, s.score * 0.05)),
  }));
}

/* ----------------------------- contradictions --------------------------- */

/** The active (unresolved) contradiction message for a note, if any. */
export function activeContradiction(events: ProvenanceEvent[], noteId: string): string | null {
  const own = events
    .filter((e) => e.noteId === noteId)
    .sort((a, b) => a.ts - b.ts);
  let active: string | null = null;
  for (const e of own) {
    if (e.kind === "contradiction_flagged")
      active = (e.data?.message as string) ?? e.summary;
    if (e.kind === "contradiction_resolved") active = null;
  }
  return active;
}

/* ------------------------------- resurface ------------------------------ */

export type ResurfaceKind = "contradiction" | "review" | "suggestion";

export interface ResurfaceItem {
  id: string;
  kind: ResurfaceKind;
  note: Note;
  detail: string;
  when: string;
  related?: Note;
}

/**
 * What the vault should resurface: live contradictions first, then notes due
 * for spaced review, then the strongest unconnected pair worth linking.
 */
export function resurfaceItems(
  notes: Note[],
  events: ProvenanceEvent[]
): ResurfaceItem[] {
  const live = liveNotes(notes);
  const items: ResurfaceItem[] = [];

  // 1. contradictions
  for (const n of live) {
    const c = activeContradiction(events, n.id);
    if (c) {
      const last = events
        .filter((e) => e.noteId === n.id && e.kind === "contradiction_flagged")
        .sort((a, b) => b.ts - a.ts)[0];
      items.push({
        id: "contra_" + n.id,
        kind: "contradiction",
        note: n,
        detail: c,
        when: last ? relAgo(last.ts) : "recently",
      });
    }
  }

  // 2. spaced review due (cadence elapsed, or explicitly flagged review)
  for (const n of live) {
    const days = cadenceDays(n.reviewCadence);
    const overdue = days != null && daysSince(n.verifiedAt) >= days;
    if ((overdue || n.status === "review") && !activeContradiction(events, n.id)) {
      items.push({
        id: "review_" + n.id,
        kind: "review",
        note: n,
        detail:
          n.verifiedAt == null
            ? "Never verified — read it through and confirm it still holds."
            : `Unverified for ${daysSince(n.verifiedAt)} days. Re-read to keep it honest.`,
        when: "due",
      });
    }
  }

  // 3. one strong suggested connection across the vault
  let best: { a: Note; b: Note; score: number } | null = null;
  for (const n of live) {
    const top = suggestedLinks(live, n, 1)[0];
    if (top && (!best || top.score > best.score) && top.score > 0)
      best = { a: n, b: top.note, score: top.score };
  }
  if (best) {
    items.push({
      id: "sugg_" + best.a.id + "_" + best.b.id,
      kind: "suggestion",
      note: best.a,
      related: best.b,
      detail:
        "Both circle the same idea. Linking them strengthens your thinking on reinforcement.",
      when: "",
    });
  }

  return items;
}

function relAgo(ts: number): string {
  const h = Math.floor((Date.now() - ts) / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* -------------------------------- folders ------------------------------- */

export interface FolderNode {
  folder: Folder;
  children: FolderNode[];
  notes: Note[];
  count: number; // total notes in subtree
}

export function buildFolderTree(folders: Folder[], notes: Note[]): FolderNode[] {
  const live = liveNotes(notes);
  const active = folders.filter((f) => !f.archivedAt);
  const byParent = new Map<string | null, Folder[]>();
  for (const f of active) {
    const k = f.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(f);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order);

  const build = (parentId: string | null): FolderNode[] =>
    (byParent.get(parentId) ?? []).map((folder) => {
      const children = build(folder.id);
      const own = live.filter((n) => n.folderId === folder.id);
      const count = own.length + children.reduce((s, c) => s + c.count, 0);
      return { folder, children, notes: own, count };
    });

  return build(null);
}

/** Notes not filed under any folder. */
export function unfiledNotes(notes: Note[]): Note[] {
  return liveNotes(notes).filter((n) => !n.folderId);
}
