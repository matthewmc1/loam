import { db } from "../db/db";
import type {
  Note,
  Folder,
  ProvenanceEvent,
  EventKind,
  NoteStatus,
  NoteType,
  NoteProperty,
  LinkType,
  LinkMeta,
  ExternalRef,
} from "../db/types";
import { uid, zid } from "../lib/id";
import { normalizeUrl, urlKey, urlLabel } from "../lib/url";
import { emptyDoc, docToText, extractTags, type PMNode } from "../lib/doc";

/* ----------------------------- provenance ------------------------------- */

const COALESCE_MS = 3 * 60 * 1000;

export async function logEvent(
  noteId: string,
  kind: EventKind,
  summary: string,
  opts: { relatedNoteId?: string; data?: Record<string, unknown>; coalesce?: boolean } = {}
): Promise<void> {
  const now = Date.now();
  if (opts.coalesce) {
    // fold rapid repeats of the same kind into the most recent event
    const last = await db.events.where("noteId").equals(noteId).last();
    if (last && last.kind === kind && now - last.ts < COALESCE_MS) {
      await db.events.update(last.id, { ts: now, summary });
      return;
    }
  }
  const ev: ProvenanceEvent = {
    id: uid("ev"),
    noteId,
    ts: now,
    kind,
    summary,
    relatedNoteId: opts.relatedNoteId,
    data: opts.data,
  };
  await db.events.add(ev);
}

/* ------------------------------- linking -------------------------------- */

/**
 * Resolve the wikilinks inside a note's doc against the current note set.
 * Returns the resolved link ids, unresolved (pending) titles, and a possibly
 * rewritten doc with freshly-resolved ids backfilled into wikiLink nodes.
 */
function resolveLinks(
  doc: PMNode,
  selfId: string,
  byTitle: Map<string, string>
): { links: string[]; pending: string[]; doc: PMNode } {
  const links: string[] = [];
  const pending: string[] = [];
  const seen = new Set<string>();
  const pendingSeen = new Set<string>();

  const visit = (n: PMNode): PMNode => {
    let next = n;
    if (n.type === "wikiLink") {
      const title = String(n.attrs?.title ?? "").trim();
      let id = (n.attrs?.id as string | null | undefined) ?? null;
      if (!id || id === selfId) {
        const resolved = byTitle.get(title.toLowerCase());
        if (resolved && resolved !== selfId) {
          id = resolved;
          next = { ...n, attrs: { ...n.attrs, id } };
        }
      }
      if (id && id !== selfId) {
        if (!seen.has(id)) {
          seen.add(id);
          links.push(id);
        }
      } else if (title && !pendingSeen.has(title.toLowerCase())) {
        pendingSeen.add(title.toLowerCase());
        pending.push(title);
      }
    }
    if (n.content) next = { ...next, content: n.content.map(visit) };
    return next;
  };

  return { links, pending, doc: visit(doc) };
}

async function titleIndex(): Promise<Map<string, string>> {
  const all = await db.notes.toArray();
  const m = new Map<string, string>();
  for (const n of all) if (!n.archivedAt) m.set(n.title.toLowerCase(), n.id);
  return m;
}

/* ------------------------------ mutations ------------------------------- */

export interface CreateNoteInput {
  type?: NoteType;
  folderId?: string | null;
  title?: string;
  doc?: PMNode;
  source?: string;
  status?: NoteStatus;
  /** records a causal "born from" event linking back to a parent note */
  derivedFrom?: { id: string; kind: Extract<EventKind, "split_from" | "derived_from" | "clipped_from">; label?: string };
}

export async function createNote(input: CreateNoteInput = {}): Promise<string> {
  const now = Date.now();
  const id = uid("n");
  const doc = input.doc ?? emptyDoc();
  const type = input.type ?? "Fleeting";
  const note: Note = {
    id,
    zid: zid(),
    title: input.title?.trim() || "Untitled",
    doc,
    text: docToText(doc),
    type,
    status: input.status ?? (type === "Fleeting" ? "fleeting" : "draft"),
    folderId: input.folderId ?? null,
    tags: extractTags(doc),
    manualTags: [],
    links: [],
    pendingLinks: [],
    manualLinks: [],
    linkMeta: [],
    aliases: [],
    refs: [],
    heroAssetId: null,
    heroPosition: 50,
    source: input.source ?? (type === "Fleeting" ? "—" : "own"),
    confidence: 0.2,
    reviewCadence: "—",
    reviewInterval: null,
    lastReviewedAt: null,
    snoozedUntil: null,
    createdAt: now,
    updatedAt: now,
    verifiedAt: null,
    archivedAt: null,
    properties: [],
  };

  await db.notes.add(note);
  await logEvent(id, "created", "draft created");

  if (input.derivedFrom) {
    await logEvent(id, input.derivedFrom.kind, input.derivedFrom.label ?? "derived from a note", {
      relatedNoteId: input.derivedFrom.id,
    });
  }

  // a new title may resolve dangling wikilinks elsewhere
  await reresolveReferrers(note.title, id);
  return id;
}

/** Dedupe tags case-insensitively, preserving first-seen casing. */
function uniqTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/** Persist an edited body. Recomputes links + tags; coalesces edit events. */
export async function saveDoc(id: string, doc: PMNode): Promise<void> {
  const note = await db.notes.get(id);
  const idx = await titleIndex();
  const { links, pending, doc: resolved } = resolveLinks(doc, id, idx);
  // prose tags ∪ manually-added tags, so UI-added tags survive body edits
  const tags = uniqTags([...extractTags(resolved), ...(note?.manualTags ?? [])]);
  await db.notes.update(id, {
    doc: resolved,
    text: docToText(resolved),
    links,
    pendingLinks: pending,
    tags,
    updatedAt: Date.now(),
  });
  await logEvent(id, "edited", "edited", { coalesce: true });
}

/** Attach a tag from the UI (no need to type # in the body). */
export async function addTag(id: string, raw: string): Promise<void> {
  const tag = raw.trim().replace(/^#+/, "").replace(/\s+/g, "-");
  if (!tag) return;
  const note = await db.notes.get(id);
  if (!note) return;
  if (note.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
  await db.notes.update(id, {
    manualTags: [...(note.manualTags ?? []), tag],
    tags: uniqTags([...note.tags, tag]),
    updatedAt: Date.now(),
  });
  await logEvent(id, "tagged", `tagged #${tag}`);
}

/** Remove a tag. Body-derived tags can only be removed by editing the prose. */
export async function removeTag(id: string, tag: string): Promise<void> {
  const note = await db.notes.get(id);
  if (!note) return;
  const lc = tag.toLowerCase();
  if (!(note.manualTags ?? []).some((t) => t.toLowerCase() === lc)) return;
  const manualTags = (note.manualTags ?? []).filter((t) => t.toLowerCase() !== lc);
  const tags = uniqTags([...extractTags(note.doc as PMNode), ...manualTags]);
  await db.notes.update(id, { manualTags, tags, updatedAt: Date.now() });
  await logEvent(id, "untagged", `removed #${tag}`);
}

export async function renameNote(id: string, title: string): Promise<void> {
  const note = await db.notes.get(id);
  if (!note) return;
  const clean = title.trim() || "Untitled";
  if (clean === note.title) return;
  await db.notes.update(id, { title: clean, updatedAt: Date.now() });
  await logEvent(id, "renamed", `renamed to “${clean}”`, {
    data: { from: note.title, to: clean },
  });
  // keep inbound wikilinks pointing at this note in sync with its new title
  await syncReferrerTitles(id, note.title, clean);
  // a note may now answer a dangling [[mention]] of its new title
  await reresolveReferrers(clean, id);
}

export async function setStatus(id: string, status: NoteStatus): Promise<void> {
  const note = await db.notes.get(id);
  if (!note || note.status === status) return;
  const patch: Partial<Note> = { status, updatedAt: Date.now() };
  if (status === "verified") patch.verifiedAt = Date.now();
  await db.notes.update(id, patch);
  await logEvent(id, "status_changed", `status → ${status}`, {
    data: { from: note.status, to: status },
  });
}

export async function setType(id: string, type: NoteType): Promise<void> {
  const note = await db.notes.get(id);
  if (!note || note.type === type) return;
  await db.notes.update(id, { type, updatedAt: Date.now() });
  await logEvent(id, "type_changed", `type → ${type}`, {
    data: { from: note.type, to: type },
  });
}

export async function verifyNote(id: string): Promise<void> {
  const now = Date.now();
  await db.notes.update(id, { verifiedAt: now, status: "verified", updatedAt: now });
  await logEvent(id, "verified", "verified");
}

export async function setSource(id: string, source: string): Promise<void> {
  await db.notes.update(id, { source, updatedAt: Date.now() });
  await logEvent(id, "source_changed", `source → ${source || "—"}`);
}

/**
 * Attach an external source to a note. Returns false when the URL isn't a
 * usable web/mail address or the note already carries it.
 */
export async function addRef(id: string, rawUrl: string, title = ""): Promise<boolean> {
  const url = normalizeUrl(rawUrl);
  const note = await db.notes.get(id);
  if (!url || !note) return false;
  const refs = note.refs ?? [];
  if (refs.some((r) => urlKey(r.url) === urlKey(url))) return false;
  const ref: ExternalRef = { id: uid("ref"), url, title: title.trim(), addedAt: Date.now() };
  await db.notes.update(id, { refs: [...refs, ref], updatedAt: Date.now() });
  await logEvent(id, "ref_added", `source added: ${ref.title || urlLabel(url)}`, { data: { url } });
  return true;
}

export async function renameRef(id: string, refId: string, title: string): Promise<void> {
  const note = await db.notes.get(id);
  if (!note) return;
  await db.notes.update(id, {
    refs: (note.refs ?? []).map((r) => (r.id === refId ? { ...r, title: title.trim() } : r)),
    updatedAt: Date.now(),
  });
}

export async function removeRef(id: string, refId: string): Promise<void> {
  const note = await db.notes.get(id);
  const ref = note?.refs?.find((r) => r.id === refId);
  if (!note || !ref) return;
  await db.notes.update(id, { refs: note.refs.filter((r) => r.id !== refId), updatedAt: Date.now() });
  await logEvent(id, "ref_removed", `source removed: ${ref.title || urlLabel(ref.url)}`, { data: { url: ref.url } });
}

/** Set, replace or (null) remove the note's hero image. */
export async function setHero(id: string, assetId: string | null): Promise<void> {
  const note = await db.notes.get(id);
  if (!note || note.heroAssetId === assetId) return;
  await db.notes.update(id, { heroAssetId: assetId, heroPosition: 50, updatedAt: Date.now() });
  await logEvent(id, "hero_changed", assetId ? (note.heroAssetId ? "cover image changed" : "cover image added") : "cover image removed");
}

/** Vertical focal point of the hero crop, 0–100. Not worth a provenance event. */
export async function setHeroPosition(id: string, position: number): Promise<void> {
  await db.notes.update(id, { heroPosition: Math.max(0, Math.min(100, Math.round(position))) });
}

export async function setConfidence(id: string, confidence: number): Promise<void> {
  const c = Math.max(0, Math.min(1, confidence));
  await db.notes.update(id, { confidence: c, updatedAt: Date.now() });
  await logEvent(id, "confidence_changed", `confidence → ${c.toFixed(2)}`, { coalesce: true });
}

/** Set the spaced-review interval (days). null takes the note off the schedule. */
export async function setReviewInterval(id: string, days: number | null): Promise<void> {
  const reviewCadence = days == null ? "—" : `every ${days}d`;
  await db.notes.update(id, {
    reviewInterval: days,
    reviewCadence,
    snoozedUntil: null,
    updatedAt: Date.now(),
  });
  await logEvent(id, "review_changed", `review → ${reviewCadence}`, {
    data: { interval: days },
  });
}

/** Interval growth on a successful review: doubles, capped at half a year. */
const REVIEW_GROWTH_CAP = 180;

/**
 * Mark a note reviewed — distinct from verified. Resets the review clock and
 * eases the interval out (7 → 14 → 28 … capped), so settled knowledge asks
 * for attention less and less often.
 */
export async function markReviewed(id: string): Promise<void> {
  const note = await db.notes.get(id);
  if (!note) return;
  const now = Date.now();
  const grown =
    note.reviewInterval != null
      ? Math.min(note.reviewInterval * 2, REVIEW_GROWTH_CAP)
      : null;
  await db.notes.update(id, {
    lastReviewedAt: now,
    snoozedUntil: null,
    reviewInterval: grown,
    reviewCadence: grown == null ? note.reviewCadence : `every ${grown}d`,
    updatedAt: now,
  });
  await logEvent(id, "reviewed", grown == null ? "reviewed" : `reviewed — next in ${grown}d`, {
    data: { from: note.reviewInterval, to: grown },
  });
}

/** Push the next review reminder out without marking the note reviewed. */
export async function snoozeReview(id: string, days = 7): Promise<void> {
  await db.notes.update(id, {
    snoozedUntil: Date.now() + days * 86400000,
    updatedAt: Date.now(),
  });
  await logEvent(id, "review_changed", `review snoozed ${days}d`, { data: { snoozeDays: days } });
}

/** Alternate titles this note answers to (drives unlinked-mention scanning). */
export async function setAliases(id: string, aliases: string[]): Promise<void> {
  const clean = aliases.map((a) => a.trim()).filter(Boolean);
  await db.notes.update(id, { aliases: clean, updatedAt: Date.now() });
  await logEvent(id, "property_changed", `aliases → ${clean.join(", ") || "—"}`, {
    coalesce: true,
  });
}

export async function moveNote(id: string, folderId: string | null): Promise<void> {
  const note = await db.notes.get(id);
  if (!note || note.folderId === folderId) return;
  const folder = folderId ? await db.folders.get(folderId) : null;
  await db.notes.update(id, { folderId, updatedAt: Date.now() });
  await logEvent(id, "moved", `moved to ${folder?.name ?? "Unfiled"}`);
}

export async function setProperties(id: string, properties: NoteProperty[]): Promise<void> {
  await db.notes.update(id, { properties, updatedAt: Date.now() });
  await logEvent(id, "property_changed", "edited properties", { coalesce: true });
}

export async function archiveNote(id: string): Promise<void> {
  await db.notes.update(id, { archivedAt: Date.now(), updatedAt: Date.now() });
  await logEvent(id, "archived", "archived");
}

export async function restoreNote(id: string): Promise<void> {
  await db.notes.update(id, { archivedAt: null, updatedAt: Date.now() });
  await logEvent(id, "restored", "restored from archive");
}

export async function deleteNoteForever(id: string): Promise<void> {
  await db.transaction("rw", db.notes, db.events, async () => {
    await db.events.where("noteId").equals(id).delete();
    await db.notes.delete(id);
    // scrub inbound references so no dangling links survive
    const all = await db.notes.toArray();
    for (const n of all) {
      const referencesInProse = (function has(node: PMNode): boolean {
        if (node.type === "wikiLink" && node.attrs?.id === id) return true;
        return (node.content ?? []).some(has);
      })(n.doc as PMNode);
      if (!n.links.includes(id) && !n.manualLinks.includes(id) && !referencesInProse)
        continue;

      // turn prose links to the deleted note back into pending mentions
      const strip = (node: PMNode): PMNode => {
        let next = node;
        if (node.type === "wikiLink" && node.attrs?.id === id)
          next = { ...node, attrs: { ...node.attrs, id: null } };
        if (node.content) next = { ...next, content: node.content.map(strip) };
        return next;
      };
      const doc = strip(n.doc as PMNode);
      await db.notes.update(n.id, {
        doc,
        text: docToText(doc),
        links: n.links.filter((x) => x !== id),
        manualLinks: n.manualLinks.filter((x) => x !== id),
        linkMeta: (n.linkMeta ?? []).filter((m) => m.targetId !== id),
      });
    }
  });
}

/* -------------------- explicit (suggested) links ------------------------ */

export interface LinkOpts {
  type?: LinkType;
  rationale?: string;
  origin?: LinkMeta["origin"];
}

export async function linkNotes(fromId: string, toId: string, opts: LinkOpts = {}): Promise<void> {
  if (fromId === toId) return;
  const from = await db.notes.get(fromId);
  const to = await db.notes.get(toId);
  if (!from || !to) return;
  if (from.links.includes(toId) || from.manualLinks.includes(toId)) return;
  const meta: LinkMeta | null = opts.type
    ? { targetId: toId, type: opts.type, rationale: opts.rationale, origin: opts.origin ?? "user" }
    : null;
  await db.notes.update(fromId, {
    manualLinks: [...from.manualLinks, toId],
    linkMeta: meta
      ? [...(from.linkMeta ?? []).filter((m) => m.targetId !== toId), meta]
      : from.linkMeta ?? [],
    updatedAt: Date.now(),
  });
  await logEvent(
    fromId,
    "linked",
    meta ? `linked to “${to.title}” (${meta.type})` : `linked to “${to.title}”`,
    {
      relatedNoteId: toId,
      data: meta ? { type: meta.type, rationale: meta.rationale, origin: meta.origin } : undefined,
    }
  );
}

export async function unlinkNotes(fromId: string, toId: string): Promise<void> {
  const from = await db.notes.get(fromId);
  if (!from) return;
  if (!from.manualLinks.includes(toId)) return; // prose links are removed by editing
  const to = await db.notes.get(toId);
  await db.notes.update(fromId, {
    manualLinks: from.manualLinks.filter((x) => x !== toId),
    linkMeta: (from.linkMeta ?? []).filter((m) => m.targetId !== toId),
    updatedAt: Date.now(),
  });
  await logEvent(fromId, "unlinked", `unlinked “${to?.title ?? toId}”`, { relatedNoteId: toId });
}

/** Persist a "don't show this again" for a resurface card / nudge / mention. */
export async function dismissForever(key: string): Promise<void> {
  await db.dismissals.put({ key, ts: Date.now() });
}

/** Resolve contradictions raised by provenance events. */
export async function resolveContradiction(id: string): Promise<void> {
  await logEvent(id, "contradiction_resolved", "contradiction resolved");
  await db.notes.update(id, { updatedAt: Date.now() });
}

/* --------------------------- link bookkeeping --------------------------- */

/** After creating a note, point any dangling wikilinks at it. */
async function reresolveReferrers(title: string, newId: string): Promise<void> {
  const all = await db.notes.toArray();
  const lc = title.toLowerCase();
  for (const n of all) {
    if (n.id === newId || !n.pendingLinks.some((t) => t.toLowerCase() === lc)) continue;
    const idx = await titleIndex();
    const { links, pending, doc } = resolveLinks(n.doc as PMNode, n.id, idx);
    await db.notes.update(n.id, { doc, links, pendingLinks: pending });
    await logEvent(n.id, "linked", `link resolved → “${title}”`, { relatedNoteId: newId });
  }
}

/** When a note is renamed, rewrite the wikiLink titles that referenced it. */
async function syncReferrerTitles(id: string, oldTitle: string, newTitle: string): Promise<void> {
  const all = await db.notes.toArray();
  for (const n of all) {
    if (n.id === id) continue;
    let changed = false;
    const rewrite = (node: PMNode): PMNode => {
      let next = node;
      if (
        node.type === "wikiLink" &&
        (node.attrs?.id === id ||
          String(node.attrs?.title ?? "").toLowerCase() === oldTitle.toLowerCase())
      ) {
        const keepLabel = node.attrs?.label && node.attrs.label !== oldTitle;
        next = {
          ...node,
          attrs: {
            ...node.attrs,
            id,
            title: newTitle,
            label: keepLabel ? node.attrs!.label : newTitle,
          },
        };
        changed = true;
      }
      if (node.content) next = { ...next, content: node.content.map(rewrite) };
      return next;
    };
    const doc = rewrite(n.doc as PMNode);
    if (changed) await db.notes.update(n.id, { doc, text: docToText(doc) });
  }
}

/* ------------------------------- folders -------------------------------- */

export async function createFolder(
  name: string,
  parentId: string | null = null,
  color = "var(--text-muted)"
): Promise<string> {
  // IndexedDB can't key on null, so filter siblings in memory for ordering.
  const all = await db.folders.toArray();
  const order = all.filter((f) => f.parentId === parentId).length;
  const id = uid("folder");
  const folder: Folder = {
    id,
    name: name.trim() || "New folder",
    color,
    parentId,
    order,
    createdAt: Date.now(),
    archivedAt: null,
  };
  await db.folders.add(folder);
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || "New folder" });
}

export async function recolorFolder(id: string, color: string): Promise<void> {
  await db.folders.update(id, { color });
}

/** Delete a folder; its notes drop to Unfiled (kept, never lost). */
export async function deleteFolder(id: string): Promise<void> {
  await db.transaction("rw", db.folders, db.notes, async () => {
    const children = await db.folders.where("parentId").equals(id).toArray();
    for (const c of children) await db.folders.update(c.id, { parentId: null });
    const notes = await db.notes.where("folderId").equals(id).toArray();
    for (const n of notes) await db.notes.update(n.id, { folderId: null });
    await db.folders.delete(id);
  });
}
