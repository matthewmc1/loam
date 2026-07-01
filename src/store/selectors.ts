import type { Note, Folder, ProvenanceEvent, LinkMeta, NoteType } from "../db/types";
import { daysSince } from "../lib/time";
import { cosine } from "../ai/vectors";
import { SUGGEST_THRESHOLD } from "../ai/config";

/** Union of prose-derived and manually-accepted outbound links. */
export function outboundIds(note: Note): string[] {
  return Array.from(new Set([...note.links, ...note.manualLinks]));
}

/**
 * The relation type/rationale behind the connection between two notes, if
 * either side recorded one when the link was made.
 */
export function linkMetaBetween(a: Note, b: Note): LinkMeta | undefined {
  return (
    (a.linkMeta ?? []).find((m) => m.targetId === b.id) ??
    (b.linkMeta ?? []).find((m) => m.targetId === a.id)
  );
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
  /** semantic similarity 0..1 for suggestion items found via embeddings */
  score?: number;
}

/** Mature notes deserve review attention first; fresh captures can wait. */
const REVIEW_PRIORITY: Record<NoteType, number> = {
  "Map of Content": 0,
  Permanent: 1,
  Literature: 2,
  Fleeting: 3,
};

/** Whether a note's spaced-review clock has run out. */
export function reviewDue(n: Note, now = Date.now()): boolean {
  if (n.snoozedUntil != null && n.snoozedUntil > now) return false;
  const anchor = Math.max(n.lastReviewedAt ?? 0, n.verifiedAt ?? 0) || null;
  const overdue = n.reviewInterval != null && daysSince(anchor, now) >= n.reviewInterval;
  // an explicit "needs review" status also surfaces — unless just reviewed
  const recentlyReviewed =
    n.lastReviewedAt != null && daysSince(n.lastReviewedAt, now) < (n.reviewInterval ?? 7);
  return overdue || (n.status === "review" && !recentlyReviewed);
}

/** Stable id for the suggested-pair card, order-independent. */
export function pairKey(a: string, b: string): string {
  return "sugg_" + [a, b].sort().join("_");
}

/**
 * What the vault should resurface: live contradictions first, then notes due
 * for spaced review (mature types first), then the strongest unconnected pair
 * worth linking — semantic when embeddings exist, keyword heuristic otherwise.
 */
export function resurfaceItems(
  notes: Note[],
  events: ProvenanceEvent[],
  vectors?: Map<string, number[]>
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

  // 2. spaced review due
  const due = live
    .filter((n) => reviewDue(n) && !activeContradiction(events, n.id))
    .sort((a, b) => REVIEW_PRIORITY[a.type] - REVIEW_PRIORITY[b.type]);
  for (const n of due) {
    const anchor = Math.max(n.lastReviewedAt ?? 0, n.verifiedAt ?? 0) || null;
    items.push({
      id: "review_" + n.id,
      kind: "review",
      note: n,
      detail:
        anchor == null
          ? "Never reviewed — read it through and confirm it still holds."
          : `Last reviewed ${daysSince(anchor)} days ago${
              n.reviewInterval ? ` (cycle: every ${n.reviewInterval}d)` : ""
            }. Re-read to keep it honest.`,
      when: "due",
    });
  }

  // 3. one strong suggested connection across the vault
  const pair = strongestUnconnectedPair(live, vectors);
  if (pair) {
    items.push({
      id: pairKey(pair.a.id, pair.b.id),
      kind: "suggestion",
      note: pair.a,
      related: pair.b,
      detail: pair.reason,
      when: "",
      score: pair.score,
    });
  }

  return items;
}

interface Pair {
  a: Note;
  b: Note;
  score: number;
  reason: string;
}

/**
 * The most-worth-linking unconnected pair. Prefers embeddings (real cosine
 * similarity); falls back to the shared-tags/neighbors heuristic — and says
 * honestly which evidence produced it.
 */
function strongestUnconnectedPair(
  live: Note[],
  vectors?: Map<string, number[]>
): Pair | null {
  const connected = (a: Note, b: Note) =>
    outboundIds(a).includes(b.id) || outboundIds(b).includes(a.id);
  const sharedTags = (a: Note, b: Note) =>
    a.tags.filter((t) => b.tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  if (vectors && vectors.size > 1) {
    let best: { a: Note; b: Note; score: number } | null = null;
    const withVec = live.filter((n) => vectors.has(n.id));
    for (let i = 0; i < withVec.length; i++) {
      for (let j = i + 1; j < withVec.length; j++) {
        const a = withVec[i];
        const b = withVec[j];
        if (connected(a, b)) continue;
        const score = cosine(vectors.get(a.id)!, vectors.get(b.id)!);
        if (score >= SUGGEST_THRESHOLD && (!best || score > best.score)) best = { a, b, score };
      }
    }
    if (best) {
      const tags = sharedTags(best.a, best.b);
      return {
        ...best,
        reason:
          `${Math.round(best.score * 100)}% semantically similar` +
          (tags.length ? ` and both tagged ${tags.map((t) => "#" + t).join(" ")}` : "") +
          " — worth connecting?",
      };
    }
    return null;
  }

  // keyword fallback: shared tags + shared neighbors
  let best: { a: Note; b: Note; score: number } | null = null;
  for (const n of live) {
    const top = suggestedLinks(live, n, 1)[0];
    if (top && top.score > 0 && (!best || top.score > best.score))
      best = { a: n, b: top.note, score: top.score };
  }
  if (!best) return null;
  const tags = sharedTags(best.a, best.b);
  const neighbors = outboundIds(best.a).filter((x) => outboundIds(best.b).includes(x)).length;
  const parts: string[] = [];
  if (tags.length) parts.push(`share ${tags.map((t) => "#" + t).join(" ")}`);
  if (neighbors) parts.push(`link to ${neighbors} of the same note${neighbors > 1 ? "s" : ""}`);
  return {
    ...best,
    score: 0,
    reason: `These ${parts.join(" and ")} — worth connecting?`,
  };
}

/* ----------------------------- vault health ----------------------------- */

export interface HealthNudge {
  /** stable key for persisted dismissal */
  key: string;
  kind: "promote" | "archive" | "moc";
  note?: Note;
  tag?: string;
  reason: string;
}

export interface VaultHealth {
  nudges: HealthNudge[];
  /** live notes with no links in or out */
  orphans: number;
  /** notes on a review schedule whose clock has run out */
  overdue: number;
  /** fleeting notes waiting to mature or be culled */
  fleeting: number;
}

const PROMOTE_AGE_DAYS = 14;
const PROMOTE_MIN_LINKS = 2;
const CULL_IDLE_DAYS = 30;
const MOC_TAG_THRESHOLD = 6;

/**
 * Maturity pressure: which fleeting notes have earned promotion, which have
 * gone stale enough to archive, and which tag clusters deserve a Map of
 * Content — plus the counts that tell you how the vault is aging.
 */
export function vaultHealth(notes: Note[]): VaultHealth {
  const live = liveNotes(notes);
  const inbound = new Map<string, number>();
  for (const n of live)
    for (const id of outboundIds(n)) inbound.set(id, (inbound.get(id) ?? 0) + 1);
  const degree = (n: Note) => outboundIds(n).length + (inbound.get(n.id) ?? 0);

  const nudges: HealthNudge[] = [];

  // fleeting notes that grew roots → promote
  const promote = live
    .filter(
      (n) =>
        n.type === "Fleeting" &&
        daysSince(n.createdAt) >= PROMOTE_AGE_DAYS &&
        degree(n) >= PROMOTE_MIN_LINKS &&
        n.updatedAt > n.createdAt
    )
    .sort((a, b) => degree(b) - degree(a))
    .slice(0, 3);
  for (const n of promote)
    nudges.push({
      key: "nudge_promote_" + n.id,
      kind: "promote",
      note: n,
      reason: `Fleeting for ${daysSince(n.createdAt)}d with ${degree(n)} connections — it has earned Permanent.`,
    });

  // fleeting notes that never took root → archive
  const cull = live
    .filter(
      (n) => n.type === "Fleeting" && daysSince(n.updatedAt) >= CULL_IDLE_DAYS && degree(n) === 0
    )
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, 3);
  for (const n of cull)
    nudges.push({
      key: "nudge_archive_" + n.id,
      kind: "archive",
      note: n,
      reason: `Untouched for ${daysSince(n.updatedAt)}d with no connections — archive it or give it a link.`,
    });

  // tag clusters with no map tying them together → create a MoC
  const tagCount = new Map<string, number>();
  const mocTags = new Set<string>();
  for (const n of live) {
    for (const t of n.tags) {
      const k = t.toLowerCase();
      tagCount.set(k, (tagCount.get(k) ?? 0) + 1);
      if (n.type === "Map of Content") mocTags.add(k);
    }
  }
  const mocCandidates = Array.from(tagCount.entries())
    .filter(([tag, count]) => count >= MOC_TAG_THRESHOLD && !mocTags.has(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  for (const [tag, count] of mocCandidates)
    nudges.push({
      key: "nudge_moc_" + tag,
      kind: "moc",
      tag,
      reason: `${count} notes share #${tag} and no map ties them together.`,
    });

  return {
    nudges,
    orphans: live.filter((n) => degree(n) === 0).length,
    overdue: live.filter((n) => reviewDue(n)).length,
    fleeting: live.filter((n) => n.type === "Fleeting").length,
  };
}

/* --------------------------- unlinked mentions --------------------------- */

export interface Mention {
  note: Note;
  /** "in" — that note's prose mentions this one; "out" — this note's prose mentions it */
  dir: "in" | "out";
  snippet: string;
}

const MIN_MENTION_LEN = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionPattern(names: string[]): RegExp | null {
  const parts = names
    .map((n) => n.trim())
    .filter((n) => n.length >= MIN_MENTION_LEN)
    .map(escapeRegExp);
  if (parts.length === 0) return null;
  // word-ish boundaries so "Loam" doesn't match inside "reloaming"
  return new RegExp(`(^|[^\\w])(${parts.join("|")})(?=[^\\w]|$)`, "i");
}

function snippetAround(text: string, match: RegExpExecArray): string {
  const at = match.index + match[1].length;
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + match[2].length + 56);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

/**
 * True unlinked mentions: live notes whose prose contains this note's title
 * or aliases (or vice versa) as plain text — no [[brackets]] — and which
 * aren't already connected. This is how an old vault re-wires itself.
 */
export function unlinkedMentions(notes: Note[], note: Note, limit = 6): Mention[] {
  const live = liveNotes(notes);
  const connected = new Set([
    note.id,
    ...outboundIds(note),
    ...backlinksOf(live, note.id).map((n) => n.id),
  ]);
  const myPattern = mentionPattern([note.title, ...(note.aliases ?? [])]);
  const results: Mention[] = [];

  for (const other of live) {
    if (results.length >= limit) break;
    if (connected.has(other.id)) continue;
    // inbound: their prose names this note
    if (myPattern) {
      const m = myPattern.exec(other.text);
      if (m) {
        results.push({ note: other, dir: "in", snippet: snippetAround(other.text, m) });
        continue;
      }
    }
    // outbound: this note's prose names them
    const theirPattern = mentionPattern([other.title, ...(other.aliases ?? [])]);
    if (theirPattern) {
      const m = theirPattern.exec(note.text);
      if (m) results.push({ note: other, dir: "out", snippet: snippetAround(note.text, m) });
    }
  }

  return results;
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
