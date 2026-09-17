/**
 * Loam domain model.
 *
 * Everything is local-first: notes, folders and an append-only provenance log
 * live in IndexedDB. The provenance log is what lets us show how knowledge
 * *evolves* over time and the causal relationships between notes.
 */

/** Zettelkasten maturity stage of a note. Distinct from where it's filed. */
export type NoteType = "Fleeting" | "Literature" | "Permanent" | "Map of Content";

export const NOTE_TYPES: NoteType[] = [
  "Fleeting",
  "Literature",
  "Permanent",
  "Map of Content",
];

/** Verification lifecycle. Drives the colored status dot. */
export type NoteStatus = "draft" | "fleeting" | "review" | "verified";

export const NOTE_STATUSES: NoteStatus[] = [
  "draft",
  "fleeting",
  "review",
  "verified",
];

/** A user-defined, nestable, colored organizational container. */
export interface Folder {
  id: string;
  name: string;
  color: string;
  /** null = top-level. Folders nest arbitrarily deep. */
  parentId: string | null;
  /** sort order among siblings */
  order: number;
  createdAt: number;
  archivedAt: number | null;
}

/** A free-form, ordered metadata property the user adds to a note. */
export interface NoteProperty {
  key: string;
  value: string;
}

/** How two linked notes relate. Same vocabulary the local model proposes. */
export type LinkType = "supports" | "contradicts" | "extends" | "refines" | "related";

export const LINK_TYPES: LinkType[] = ["supports", "contradicts", "extends", "refines", "related"];

/**
 * The "why" behind a manual link — kept so future-you knows what the
 * connection meant, not just that it exists.
 */
export interface LinkMeta {
  /** target note id (an entry in `manualLinks`) */
  targetId: string;
  type: LinkType;
  /** one-line reason these two connect */
  rationale?: string;
  /** where the link came from */
  origin: "user" | "ai" | "suggestion" | "resurface" | "mention";
}

/**
 * A pointer out of the vault — the article, paper, video or doc a note draws
 * on. Links written in the prose are discovered from the body; these are the
 * ones attached deliberately, with a name of their own.
 */
export interface ExternalRef {
  id: string;
  url: string;
  /** what to call it; empty = show a label derived from the URL */
  title: string;
  addedAt: number;
}

/** Preset spaced-review intervals offered in the inspector, in days. */
export const REVIEW_INTERVALS = [7, 30, 90, 180] as const;

export interface Note {
  id: string;
  /** Zettelkasten timestamp id, e.g. 202606281521 — stable, human-meaningful. */
  zid: string;
  title: string;
  /** Tiptap JSON document. Source of truth for the body. */
  doc: unknown;
  /** Plaintext mirror of `doc`, kept in sync on save for search + previews. */
  text: string;

  type: NoteType;
  status: NoteStatus;
  folderId: string | null;

  /** Display/search tags: union of #tags in the body and manually-added ones. */
  tags: string[];
  /** Tags attached via the UI (not present as #tags in the prose). */
  manualTags: string[];
  /** Resolved outbound link target note ids (derived from [[wikilinks]] in doc). */
  links: string[];
  /** Wikilink titles that don't resolve to a note yet — offered as "create". */
  pendingLinks: string[];
  /** Links accepted from suggestions / "link them", not present in the prose. */
  manualLinks: string[];
  /** Relation type + rationale for links in `manualLinks` that carry one. */
  linkMeta: LinkMeta[];
  /** Alternate titles this note answers to — used for unlinked-mention scanning. */
  aliases: string[];

  /** External sources & material attached to this note (not in the prose). */
  refs: ExternalRef[];

  /** Where the knowledge came from: a book, an interview, a feed clipping, own. */
  source: string;
  /** 0..1 — how much you trust this note right now. */
  confidence: number;
  /** Spaced-review cadence, e.g. "every 30d" or "—". Display mirror of `reviewInterval`. */
  reviewCadence: string;
  /** Days between reviews. null = not on a review schedule. Source of truth. */
  reviewInterval: number | null;
  /** When the note was last marked reviewed (distinct from verified). */
  lastReviewedAt: number | null;
  /** Review reminders suppressed until this time (set by Snooze). */
  snoozedUntil: number | null;

  createdAt: number;
  updatedAt: number;
  /** When the note's claims were last verified (drives Resurface). null = never. */
  verifiedAt: number | null;
  /** Soft-delete / archive. Archived notes are hidden but never lose history. */
  archivedAt: number | null;

  /** User-defined extra metadata, ordered. */
  properties: NoteProperty[];

  /* ---- AI-derived (local models) ---- */
  /** Key concepts Gemma pulled from the note. */
  aiConcepts?: string[];
  /** Typed relations Gemma proposed to other notes. */
  aiRelations?: AiRelation[];
  /** When Gemma last analyzed this note. */
  aiAnalyzedAt?: number | null;
}

/** A typed relationship the local model proposes between two notes. */
export interface AiRelation {
  /** resolved target note id, if matched */
  targetId: string | null;
  /** target note title (as the model named it) */
  target: string;
  type: "supports" | "contradicts" | "extends" | "refines" | "related";
  rationale: string;
}

/** A locally-computed embedding for a note, stored in IndexedDB. */
export interface Vector {
  /** note id */
  id: string;
  /** embedding model that produced it */
  model: string;
  dim: number;
  /** hash of the embedded text, to detect staleness */
  hash: string;
  /** the embedding (normalized) */
  vec: number[];
  updatedAt: number;
}

/**
 * Append-only provenance events. The history of how a note came to be and
 * changed — including causal links (split_from, derived_from, clipped_from)
 * that aren't associative [[links]] but record where an idea originated.
 */
export type EventKind =
  | "created"
  | "edited"
  | "renamed"
  | "status_changed"
  | "type_changed"
  | "verified"
  | "linked"
  | "unlinked"
  | "tagged"
  | "untagged"
  | "moved"
  | "source_changed"
  | "ref_added"
  | "ref_removed"
  | "decision_changed"
  | "confidence_changed"
  | "review_changed"
  | "reviewed"
  | "property_changed"
  | "split_from"
  | "derived_from"
  | "clipped_from"
  | "contradiction_flagged"
  | "contradiction_resolved"
  | "analyzed"
  | "task_created"
  | "task_completed"
  | "archived"
  | "restored";

export interface ProvenanceEvent {
  id: string;
  noteId: string;
  ts: number;
  kind: EventKind;
  /** Human-readable summary shown in the provenance timeline. */
  summary: string;
  /** Another note this event causally references (e.g. the parent of a split). */
  relatedNoteId?: string;
  /** Structured payload for richer rendering / future audit. */
  data?: Record<string, unknown>;
}

/**
 * A persisted "don't show me this again" for resurface cards, suggestion rows
 * and health nudges — so dismissals survive reload instead of nagging.
 */
export interface Dismissal {
  /** stable key, e.g. "sugg_<a>_<b>", "mention_<a>_<b>", "nudge_promote_<id>" */
  key: string;
  ts: number;
}

/** The view currently shown in <main>. */
export type View = "note" | "resurface" | "ask" | "archive";

/** Static maps shared across UI for status presentation. */
export const STATUS_COLOR: Record<NoteStatus, string> = {
  verified: "var(--status-verified)",
  review: "var(--status-review)",
  fleeting: "var(--status-fleeting)",
  draft: "var(--status-draft)",
};

export const STATUS_LABEL: Record<NoteStatus, string> = {
  verified: "Verified",
  review: "Needs review",
  fleeting: "Fleeting",
  draft: "Draft",
};

/** Default folder accent colors, keyed by the seeded folder name. */
export const DEFAULT_FOLDER_COLOR: Record<string, string> = {
  Permanent: "var(--folder-permanent)",
  Literature: "var(--folder-literature)",
  "Maps of Content": "var(--folder-moc)",
  Fleeting: "var(--folder-fleeting)",
};
