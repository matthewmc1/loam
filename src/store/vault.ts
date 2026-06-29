import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { Note, Folder, ProvenanceEvent } from "../db/types";

export interface Vault {
  notes: Note[];
  folders: Folder[];
  events: ProvenanceEvent[];
  loading: boolean;
}

/** Reactive read of the whole local store. Re-renders on any local change. */
export function useVault(): Vault {
  const notes = useLiveQuery(() => db.notes.toArray(), [], undefined);
  const folders = useLiveQuery(() => db.folders.orderBy("order").toArray(), [], undefined);
  const events = useLiveQuery(() => db.events.toArray(), [], undefined);
  return {
    notes: notes ?? [],
    folders: folders ?? [],
    events: events ?? [],
    loading: notes === undefined || folders === undefined || events === undefined,
  };
}

/**
 * Events for a single note, newest first. Pass a `limit` to fetch only the most
 * recent N via the `[noteId+ts]` index — so a note with a huge history never
 * loads the whole timeline into the inspector.
 */
export function useNoteEvents(noteId: string | null, limit?: number): ProvenanceEvent[] {
  const events = useLiveQuery(async () => {
    if (!noteId) return [] as ProvenanceEvent[];
    let coll = db.events
      .where("[noteId+ts]")
      .between([noteId, Dexie.minKey], [noteId, Dexie.maxKey])
      .reverse();
    if (limit != null) coll = coll.limit(limit);
    return coll.toArray();
  }, [noteId, limit]);
  return events ?? [];
}

/** Total number of provenance events for a note (cheap count, reactive). */
export function useEventCount(noteId: string | null): number {
  const count = useLiveQuery(async () => {
    if (!noteId) return 0;
    return db.events.where("noteId").equals(noteId).count();
  }, [noteId]);
  return count ?? 0;
}
