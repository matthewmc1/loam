import Dexie, { type Table } from "dexie";
import type { Note, Folder, ProvenanceEvent, Vector, Dismissal } from "./types";
import type { OutboxOp } from "../cadence/outbox";
import { cadenceDays } from "../lib/time";

/**
 * Loam's local-first store. Everything lives in IndexedDB in the browser —
 * no server, no account. The `events` table is append-only and is what makes
 * the evolution of knowledge auditable over time.
 */
export class LoamDB extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  events!: Table<ProvenanceEvent, string>;
  vectors!: Table<Vector, string>;
  dismissals!: Table<Dismissal, string>;
  outbox!: Table<OutboxOp, string>;

  constructor() {
    super("loam");
    this.version(1).stores({
      // indexed fields only; the full object is stored regardless
      notes: "id, zid, title, type, status, folderId, updatedAt, archivedAt, *tags, *links",
      folders: "id, parentId, order, archivedAt",
      events: "id, noteId, ts, kind",
    });
    // v2: local embedding vectors for semantic similarity
    this.version(2).stores({
      notes: "id, zid, title, type, status, folderId, updatedAt, archivedAt, *tags, *links",
      folders: "id, parentId, order, archivedAt",
      events: "id, noteId, ts, kind",
      vectors: "id, model",
    });
    // v3: compound [noteId+ts] index so a note's history can be fetched
    // newest-first with a LIMIT — large, long-evolving docs never load it all.
    this.version(3).stores({
      notes: "id, zid, title, type, status, folderId, updatedAt, archivedAt, *tags, *links",
      folders: "id, parentId, order, archivedAt",
      events: "id, noteId, ts, kind, [noteId+ts]",
      vectors: "id, model",
    });
    // v4: the review loop (structured interval, lastReviewedAt, snooze), typed
    // link metadata, aliases for mention scanning, and persisted dismissals.
    this.version(4)
      .stores({
        notes: "id, zid, title, type, status, folderId, updatedAt, archivedAt, *tags, *links",
        folders: "id, parentId, order, archivedAt",
        events: "id, noteId, ts, kind, [noteId+ts]",
        vectors: "id, model",
        dismissals: "key",
      })
      .upgrade((tx) =>
        tx
          .table("notes")
          .toCollection()
          .modify((n: Note) => {
            n.reviewInterval = n.reviewInterval ?? cadenceDays(n.reviewCadence ?? "");
            n.lastReviewedAt = n.lastReviewedAt ?? null;
            n.snoozedUntil = n.snoozedUntil ?? null;
            n.aliases = n.aliases ?? [];
            n.linkMeta = n.linkMeta ?? [];
          })
      );
    // v5: offline outbox — Cadence writes queued while the server is
    // unreachable (plane mode / server down), flushed on reconnect.
    this.version(5).stores({
      notes: "id, zid, title, type, status, folderId, updatedAt, archivedAt, *tags, *links",
      folders: "id, parentId, order, archivedAt",
      events: "id, noteId, ts, kind, [noteId+ts]",
      vectors: "id, model",
      dismissals: "key",
      outbox: "id, ts",
    });
  }
}

export const db = new LoamDB();
