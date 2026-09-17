import { db } from "./db";
import type {
  Note,
  Folder,
  ProvenanceEvent,
  NoteType,
  NoteStatus,
  EventKind,
} from "./types";
import { DEFAULT_FOLDER_COLOR } from "./types";
import type { PMNode } from "../lib/doc";
import { docToText } from "../lib/doc";
import { cadenceDays } from "../lib/time";

/* ----------------------------- seed source ------------------------------ */

interface SeedSpan {
  t?: string;
  to?: string;
  label?: string;
  tag?: string;
}
interface SeedBlock {
  h?: string;
  p?: SeedSpan[];
  quote?: SeedSpan[];
  li?: SeedSpan[];
}
interface SeedNote {
  id: string;
  title: string;
  type: NoteType;
  folder: string;
  status: NoteStatus;
  source: string;
  conf: number;
  review: string;
  verified: string; // "71d ago" | "—"
  tags: string[];
  out: string[];
  blocks: SeedBlock[];
  history: { when: string; what: string }[];
  /** external sources attached to the note */
  refs?: { url: string; title: string }[];
}

const T = (t: string): SeedSpan => ({ t });
const L = (to: string, label: string): SeedSpan => ({ to, label });

const SEED: SeedNote[] = [
  {
    id: "moat",
    title: "Moat thesis: switching costs",
    type: "Permanent",
    folder: "Permanent",
    status: "review",
    source: "Board memo",
    conf: 0.7,
    review: "every 30d",
    verified: "71d ago",
    tags: ["strategy", "defensibility"],
    out: ["compound", "activation"],
    blocks: [
      {
        p: [
          T("The moat isn’t the product. It’s the "),
          L("compound", "compounding knowledge"),
          T(
            " a team accumulates here — interlinked, verified, and impossible to carry out the door."
          ),
        ],
      },
      { h: "The argument" },
      {
        p: [
          T("Every link drawn, every contradiction resolved, every note "),
          L("activation", "revisited on day two"),
          T(
            ", raises the cost of leaving. Value grows with the density of the graph, not the count of features."
          ),
        ],
      },
      {
        quote: [
          T("Switching cost is not a feature you ship. It is a structure that accretes."),
        ],
      },
      {
        li: [
          T(
            "Flat note-stores have no maturity model — fleeting and permanent ideas blur together."
          ),
        ],
      },
      {
        li: [
          T(
            "Without a local-first guarantee, regulated teams never adopt, so the graph never gets dense."
          ),
        ],
      },
      {
        p: [
          T("Open thread: a rival with capital could buy density through migration tooling. See "),
          L("northwind", "Northwind’s raise"),
          T("."),
        ],
      },
    ],
    history: [
      { when: "71d", what: "created from board memo" },
      { when: "40d", what: "split out “atomic notes”" },
      { when: "6h", what: "⚠ external signal flagged a claim" },
    ],
  },
  {
    id: "compound",
    title: "Knowledge compounds with density",
    type: "Permanent",
    folder: "Permanent",
    status: "verified",
    source: "own",
    conf: 0.9,
    review: "every 60d",
    verified: "3d ago",
    tags: ["systems"],
    out: ["atomic", "moat"],
    blocks: [
      {
        p: [
          T(
            "A single note is nearly worthless. Its value is a function of how many other notes it touches — knowledge "
          ),
          L("moat", "compounds"),
          T(" the way interest does."),
        ],
      },
      { h: "Density beats volume" },
      {
        p: [
          T(
            "Ten linked notes outperform a hundred orphans. The link is the unit of thought, not the note — which is exactly why "
          ),
          L("atomic", "atomic notes"),
          T(" matter: small, single-idea notes have more surface to connect."),
        ],
      },
      { quote: [T("Write notes you can link, not notes you can file.")] },
    ],
    history: [
      { when: "77d", what: "created" },
      { when: "3d", what: "verified, added link to atomic" },
    ],
  },
  {
    id: "activation",
    title: "Activation happens on day two",
    type: "Permanent",
    folder: "Permanent",
    status: "verified",
    source: "14 interviews",
    conf: 0.8,
    review: "every 45d",
    verified: "5d ago",
    tags: ["product", "retention"],
    out: ["moat"],
    blocks: [
      {
        p: [
          T(
            "Across interviews, the moment a knowledge tool “clicks” is never the first note — it’s the "
          ),
          L("moat", "second day"),
          T(", when a past note resurfaces exactly when it’s needed."),
        ],
      },
      { h: "Implication" },
      {
        p: [
          T(
            "Design for return, not capture. Resurfacing and spaced review are the product, not a feature bolted on."
          ),
        ],
      },
      { li: [T("Day 0 — capture is easy, everyone does it.")] },
      { li: [T("Day 2 — retrieval is hard, and almost no tool nails it.")] },
    ],
    history: [
      { when: "57d", what: "created from interview notes" },
      { when: "5d", what: "verified" },
    ],
  },
  {
    id: "atomic",
    title: "One idea, one note",
    type: "Permanent",
    folder: "Permanent",
    status: "verified",
    source: "own",
    conf: 0.85,
    review: "every 90d",
    verified: "8d ago",
    tags: ["method", "zettelkasten"],
    out: ["compound"],
    blocks: [
      {
        p: [
          T(
            "A note should hold exactly one idea, stated so it can stand alone and be linked from anywhere. If a note needs the word “and”, split it."
          ),
        ],
      },
      {
        quote: [
          T("Atomicity is what lets a note be reused in contexts you can’t predict yet."),
        ],
      },
    ],
    history: [
      { when: "80d", what: "created" },
      { when: "8d", what: "verified" },
    ],
  },
  {
    id: "ahrens",
    title: "Ahrens — How to Take Smart Notes",
    refs: [{ url: "https://www.soenkeahrens.de/en/takesmartnotes", title: "How to Take Smart Notes — Sönke Ahrens" }],
    type: "Literature",
    folder: "Literature",
    status: "verified",
    source: "book",
    conf: 0.75,
    review: "—",
    verified: "20d ago",
    tags: ["method"],
    out: ["atomic", "compound"],
    blocks: [
      {
        p: [
          T(
            "Source note. Ahrens frames the slip-box as a thinking partner: you write permanent notes in your own words and let structure emerge from links rather than predefined folders."
          ),
        ],
      },
      {
        li: [T("Fleeting → literature → permanent is a pipeline, not a filing cabinet.")],
      },
      { li: [T("The goal is to write yourself into new ideas, not to store old ones.")] },
    ],
    history: [
      { when: "92d", what: "clipped & summarised" },
      { when: "20d", what: "rewrote in own words" },
    ],
  },
  {
    id: "northwind",
    title: "Clip — Northwind raises $40M",
    type: "Literature",
    folder: "Literature",
    status: "verified",
    source: "TechCrunch",
    conf: 0.95,
    review: "—",
    verified: "4d ago",
    tags: ["competitor"],
    out: ["moat"],
    blocks: [
      {
        p: [
          T(
            "Clipping. Northwind announced a $40M Series B on Jun 24, explicitly to fund an enterprise tier — contradicting the funding assumption in "
          ),
          L("moat", "Moat thesis"),
          T("."),
        ],
      },
    ],
    history: [{ when: "4d", what: "auto-captured from feed" }],
  },
  {
    id: "moc-know",
    title: "Knowledge system — MOC",
    type: "Map of Content",
    folder: "Maps of Content",
    status: "verified",
    source: "index",
    conf: 0.8,
    review: "every 30d",
    verified: "2d ago",
    tags: ["moc"],
    out: ["atomic", "compound", "activation", "ahrens"],
    blocks: [
      {
        p: [
          T(
            "A map of content for how this vault thinks about building knowledge. Start here."
          ),
        ],
      },
      { h: "Method" },
      {
        p: [
          L("atomic", "One idea, one note"),
          T("   ·   "),
          L("ahrens", "How to Take Smart Notes"),
          T("."),
        ],
      },
      { h: "Principles" },
      {
        p: [
          L("compound", "Knowledge compounds with density"),
          T("   ·   "),
          L("activation", "Activation happens on day two"),
          T("."),
        ],
      },
    ],
    history: [
      { when: "88d", what: "created as index" },
      { when: "2d", what: "added activation" },
    ],
  },
  {
    id: "moc-strat",
    title: "Strategy — MOC",
    type: "Map of Content",
    folder: "Maps of Content",
    status: "review",
    source: "index",
    conf: 0.5,
    review: "every 30d",
    verified: "60d ago",
    tags: ["moc"],
    out: ["moat"],
    blocks: [
      {
        p: [
          T("Index of strategy notes. Currently thin and overdue for a verification pass."),
        ],
      },
      { p: [L("moat", "Moat thesis: switching costs"), T(".")] },
    ],
    history: [
      { when: "88d", what: "created" },
      { when: "60d", what: "last verified" },
    ],
  },
  {
    id: "fleet-spaced",
    title: "Resurfacing = spaced repetition?",
    type: "Fleeting",
    folder: "Fleeting",
    status: "fleeting",
    source: "—",
    conf: 0.3,
    review: "—",
    verified: "—",
    tags: ["idea"],
    out: ["compound"],
    blocks: [
      {
        p: [
          T(
            "Half-formed: what if resurfacing is just spaced repetition applied to your own ideas instead of flashcards? The “card” is a note; the “review” is a re-read with fresh context."
          ),
        ],
      },
    ],
    history: [{ when: "2d", what: "captured" }],
  },
  {
    id: "fleet-moat",
    title: "Is a moat a note or a cluster?",
    type: "Fleeting",
    folder: "Fleeting",
    status: "fleeting",
    source: "—",
    conf: 0.3,
    review: "—",
    verified: "—",
    tags: ["question"],
    out: ["moat", "compound"],
    blocks: [
      {
        p: [
          T(
            "Question to resolve: is the moat a single note or an emergent property of a cluster? Leaning cluster — see "
          ),
          L("compound", "compounding"),
          T("."),
        ],
      },
    ],
    history: [{ when: "1d", what: "captured" }],
  },
];

/* --------------------------- build helpers ------------------------------ */

const FOLDER_ORDER = ["Permanent", "Literature", "Maps of Content", "Fleeting"];

function folderId(name: string): string {
  return "folder_" + name.toLowerCase().replace(/[^a-z]+/g, "_");
}

function parseAge(s: string): number {
  const h = /(\d+)\s*h/.exec(s);
  if (h) return Number(h[1]) * 3600000;
  const d = /(\d+)\s*d/.exec(s);
  if (d) return Number(d[1]) * 86400000;
  return 0;
}

const TITLE_BY_ID = Object.fromEntries(SEED.map((n) => [n.id, n.title]));

function spanToNode(s: SeedSpan): PMNode {
  if (s.to)
    return {
      type: "wikiLink",
      attrs: { id: s.to, title: TITLE_BY_ID[s.to] ?? s.label, label: s.label },
    };
  if (s.tag) return { type: "tag", attrs: { name: s.tag } };
  return { type: "text", text: s.t ?? "" };
}

function blocksToDoc(blocks: SeedBlock[]): PMNode {
  const content: PMNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.h !== undefined) {
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: b.h }],
      });
      i++;
    } else if (b.p) {
      content.push({ type: "paragraph", content: b.p.map(spanToNode) });
      i++;
    } else if (b.quote) {
      content.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: b.quote.map(spanToNode) }],
      });
      i++;
    } else if (b.li) {
      const items: PMNode[] = [];
      while (i < blocks.length && blocks[i].li) {
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: blocks[i].li!.map(spanToNode) }],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
    } else {
      i++;
    }
  }
  return { type: "doc", content };
}

function eventKind(what: string, first: boolean): EventKind {
  const w = what.toLowerCase();
  if (w.includes("⚠") || w.includes("flag")) return "contradiction_flagged";
  if (w.includes("verif")) return "verified";
  if (w.includes("split")) return "split_from";
  if (w.includes("clip") || w.includes("captured") || w.includes("auto-captured"))
    return "clipped_from";
  if (first) return "created";
  return "edited";
}

/* ------------------------------ the seed -------------------------------- */

let seeding: Promise<void> | null = null;

/** Seed the vault once. Guards against React StrictMode's double-invocation. */
export function seedIfEmpty(): Promise<void> {
  if (!seeding) seeding = doSeed();
  return seeding;
}

/**
 * Set once the vault has ever held notes. Its presence means an empty vault
 * is a *choice* (the user deleted everything) — the samples must not
 * resurrect on the next launch.
 */
const SEEDED_FLAG = "loam-seeded";

/** Wipe every table and reseed from the sample data. Destructive. */
export async function resetVault(): Promise<void> {
  await db.transaction("rw", db.folders, db.notes, db.events, db.vectors, db.dismissals, async () => {
    await db.notes.clear();
    await db.folders.clear();
    await db.events.clear();
    await db.vectors.clear();
    await db.dismissals.clear();
  });
  // clear any persisted AI flags so the fresh vault starts clean
  try {
    localStorage.removeItem("loam-ai-embed");
    localStorage.removeItem(SEEDED_FLAG); // an explicit reset DOES want the samples back
  } catch {
    /* ignore */
  }
  seeding = null; // allow re-seed
  await seedIfEmpty();
}

async function doSeed(): Promise<void> {
  const count = await db.notes.count();
  if (count > 0) {
    try {
      localStorage.setItem(SEEDED_FLAG, "1");
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (localStorage.getItem(SEEDED_FLAG)) return; // deliberately emptied — stay empty
  } catch {
    /* ignore */
  }

  const now = Date.now();

  const folders: Folder[] = FOLDER_ORDER.map((name, i) => ({
    id: folderId(name),
    name,
    color: DEFAULT_FOLDER_COLOR[name] ?? "var(--text-muted)",
    parentId: null,
    order: i,
    createdAt: now - 90 * 86400000,
    archivedAt: null,
  }));

  const notes: Note[] = [];
  const events: ProvenanceEvent[] = [];

  for (const s of SEED) {
    // oldest history entry = creation; newest = last touch
    const ages = s.history.map((h) => parseAge(h.when));
    const createdAt = now - Math.max(...ages); // oldest event
    const updatedAt = now - Math.min(...ages); // most recent event
    const verifiedAt = s.verified === "—" ? null : now - parseAge(s.verified);

    const doc = blocksToDoc(s.blocks);

    notes.push({
      id: s.id,
      zid: zidFromDate(new Date(createdAt)),
      title: s.title,
      doc,
      text: docToText(doc),
      type: s.type,
      status: s.status,
      folderId: folderId(s.folder),
      tags: s.tags,
      manualTags: [],
      links: s.out,
      pendingLinks: [],
      manualLinks: [],
      linkMeta: [],
      aliases: [],
      refs: (s.refs ?? []).map((r, i) => ({ id: `${s.id}_ref${i}`, ...r, addedAt: createdAt })),
      source: s.source,
      confidence: s.conf,
      reviewCadence: s.review,
      reviewInterval: cadenceDays(s.review),
      lastReviewedAt: null,
      snoozedUntil: null,
      createdAt,
      updatedAt,
      verifiedAt,
      archivedAt: null,
      properties: [],
    });

    // provenance: oldest first
    const ordered = [...s.history].sort((a, b) => parseAge(b.when) - parseAge(a.when));
    ordered.forEach((h, idx) => {
      const ts = now - parseAge(h.when);
      const kind = eventKind(h.what, idx === 0);
      events.push({
        id: `${s.id}_ev${idx}`,
        noteId: s.id,
        ts,
        kind,
        summary: h.what,
        data:
          kind === "contradiction_flagged"
            ? {
                message:
                  "A live signal says Northwind raised $40M — the funding claim here is likely stale.",
              }
            : undefined,
      });
    });
  }

  await db.transaction("rw", db.folders, db.notes, db.events, async () => {
    await db.folders.bulkAdd(folders);
    await db.notes.bulkAdd(notes);
    await db.events.bulkAdd(events);
  });
  try {
    localStorage.setItem(SEEDED_FLAG, "1");
  } catch {
    /* ignore */
  }
}

function zidFromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
}
