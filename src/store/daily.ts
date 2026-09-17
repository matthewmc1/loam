import { db } from "../db/db";
import { createFolder, createNote } from "./notes";
import { dayKey } from "../lib/narrative";

const DAILY_FOLDER = "Daily";

/**
 * Today's note — one per date, titled by the date, filed under "Daily".
 * Finds it if it exists (archived ones don't count), creates it if not.
 */
export async function openDailyNote(now = Date.now()): Promise<string> {
  const title = dayKey(now);
  const existing = (await db.notes.where("title").equals(title).toArray()).find((n) => !n.archivedAt);
  if (existing) return existing.id;

  const folders = await db.folders.toArray();
  const folder = folders.find((f) => f.name === DAILY_FOLDER && !f.archivedAt && f.parentId === null);
  const folderId = folder?.id ?? (await createFolder(DAILY_FOLDER, null, "var(--status-review)"));
  return createNote({ title, folderId, type: "Fleeting", source: "journal" });
}
