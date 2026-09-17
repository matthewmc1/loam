/**
 * Vault backup: export everything that can't be recomputed to a JSON file the
 * user owns, and restore from one. This is the no-data-loss escape hatch —
 * IndexedDB is durable but lives inside one browser profile; a file survives
 * profile resets, machine moves, and browser storage pressure.
 *
 * Vectors are deliberately excluded (recomputed from note text on demand);
 * the Cadence token is never included (it lives in localStorage, not here).
 */
import { db } from "../db/db";
import { cadenceDays } from "./time";
import type { Note, Folder, ProvenanceEvent, Dismissal } from "../db/types";

const FORMAT = "loam-vault";
const FORMAT_VERSION = 1;

export interface VaultBackup {
  format: typeof FORMAT;
  version: number;
  exportedAt: number;
  notes: Note[];
  folders: Folder[];
  events: ProvenanceEvent[];
  dismissals: Dismissal[];
}

export async function buildBackup(): Promise<VaultBackup> {
  const [notes, folders, events, dismissals] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.events.toArray(),
    db.dismissals.toArray(),
  ]);
  return { format: FORMAT, version: FORMAT_VERSION, exportedAt: Date.now(), notes, folders, events, dismissals };
}

/** Download the vault as `loam-vault-YYYY-MM-DD.json`. */
export async function exportVault(): Promise<void> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date(backup.exportedAt);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  a.href = url;
  a.download = `loam-vault-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Bring a note from an older export up to the current shape. IndexedDB
 * upgrades (db.ts) only run on data already in the database — a backup file
 * taken before a field existed bypasses them, so restore fills the gaps here.
 * Add a line whenever Note gains a required field.
 */
export function normalizeNote(raw: Note): Note {
  const n = raw as Partial<Note> & Note;
  return {
    ...n,
    tags: n.tags ?? [],
    manualTags: n.manualTags ?? [],
    links: n.links ?? [],
    pendingLinks: n.pendingLinks ?? [],
    manualLinks: n.manualLinks ?? [],
    linkMeta: n.linkMeta ?? [],
    aliases: n.aliases ?? [],
    refs: n.refs ?? [],
    properties: n.properties ?? [],
    reviewCadence: n.reviewCadence ?? "—",
    reviewInterval: n.reviewInterval ?? cadenceDays(n.reviewCadence ?? ""),
    lastReviewedAt: n.lastReviewedAt ?? null,
    snoozedUntil: n.snoozedUntil ?? null,
    verifiedAt: n.verifiedAt ?? null,
    archivedAt: n.archivedAt ?? null,
  };
}

/** Parse + sanity-check a backup file. Throws with a human message if it isn't one. */
export function parseBackup(text: string): VaultBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON.");
  }
  const b = data as Partial<VaultBackup>;
  if (b?.format !== FORMAT || !Array.isArray(b.notes) || !Array.isArray(b.folders))
    throw new Error("That file isn't a Loam vault export.");
  if ((b.version ?? 0) > FORMAT_VERSION)
    throw new Error("This export was made by a newer Loam — update the app first.");
  return {
    format: FORMAT,
    version: b.version ?? 1,
    exportedAt: b.exportedAt ?? 0,
    notes: (b.notes as Note[]).map(normalizeNote),
    folders: b.folders as Folder[],
    events: (b.events ?? []) as ProvenanceEvent[],
    dismissals: (b.dismissals ?? []) as Dismissal[],
  };
}

/**
 * Replace the current vault with a backup's contents, atomically — either the
 * whole restore lands or nothing changes. Vectors are cleared so embeddings
 * recompute against the restored notes.
 */
export async function restoreBackup(backup: VaultBackup): Promise<void> {
  await db.transaction("rw", db.notes, db.folders, db.events, db.vectors, db.dismissals, async () => {
    await Promise.all([
      db.notes.clear(),
      db.folders.clear(),
      db.events.clear(),
      db.vectors.clear(),
      db.dismissals.clear(),
    ]);
    await db.folders.bulkAdd(backup.folders);
    await db.notes.bulkAdd(backup.notes);
    if (backup.events.length) await db.events.bulkAdd(backup.events);
    if (backup.dismissals.length) await db.dismissals.bulkAdd(backup.dismissals);
  });
}
