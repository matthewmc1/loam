import { describe, expect, it } from "vitest";
import { db } from "../db/db";
import {
  archiveNote,
  createNote,
  deleteNoteForever,
  linkNotes,
  markReviewed,
  renameNote,
  restoreNote,
  saveDoc,
  setReviewInterval,
  unlinkNotes,
} from "../store/notes";
import type { PMNode } from "../lib/doc";

const para = (...content: PMNode[]): PMNode => ({ type: "doc", content: [{ type: "paragraph", content }] });
const text = (t: string): PMNode => ({ type: "text", text: t });
const wiki = (title: string, id: string | null = null): PMNode => ({ type: "wikiLink", attrs: { title, id } });
const tag = (name: string): PMNode => ({ type: "tag", attrs: { name } });

describe("createNote", () => {
  it("writes a complete note and a created event", async () => {
    const id = await createNote({ title: "  First  " });
    const note = (await db.notes.get(id))!;
    expect(note.title).toBe("First");
    expect(note.type).toBe("Fleeting");
    expect(note.status).toBe("fleeting");
    expect(note.linkMeta).toEqual([]);
    const events = await db.events.where("noteId").equals(id).toArray();
    expect(events.map((e) => e.kind)).toEqual(["created"]);
  });
});

describe("saveDoc", () => {
  it("resolves wikilinks to existing notes and keeps the rest pending", async () => {
    const target = await createNote({ title: "Target" });
    const id = await createNote({ title: "Source" });
    await saveDoc(id, para(text("see "), wiki("target"), text(" and "), wiki("Nowhere"), tag("idea")));
    const note = (await db.notes.get(id))!;
    expect(note.links).toEqual([target]);
    expect(note.pendingLinks).toEqual(["Nowhere"]);
    expect(note.tags).toEqual(["idea"]);
    expect(note.text).toContain("see target");
  });

  it("a newly created note resolves dangling links that were waiting for it", async () => {
    const id = await createNote({ title: "Source" });
    await saveDoc(id, para(wiki("Later")));
    const later = await createNote({ title: "Later" });
    const note = (await db.notes.get(id))!;
    expect(note.links).toEqual([later]);
    expect(note.pendingLinks).toEqual([]);
  });

  it("renaming a note into a pending title resolves it too", async () => {
    const id = await createNote({ title: "Source" });
    await saveDoc(id, para(wiki("Final name")));
    const other = await createNote({ title: "Working name" });
    await renameNote(other, "Final name");
    expect((await db.notes.get(id))!.links).toEqual([other]);
  });
});

describe("manual links", () => {
  it("stores typed metadata, ignores duplicates and self-links, and unlinks cleanly", async () => {
    const a = await createNote({ title: "A" });
    const b = await createNote({ title: "B" });
    await linkNotes(a, a);
    await linkNotes(a, b, { type: "supports", rationale: "because", origin: "ai" });
    await linkNotes(a, b);
    let note = (await db.notes.get(a))!;
    expect(note.manualLinks).toEqual([b]);
    expect(note.linkMeta).toEqual([{ targetId: b, type: "supports", rationale: "because", origin: "ai" }]);

    await unlinkNotes(a, b);
    note = (await db.notes.get(a))!;
    expect(note.manualLinks).toEqual([]);
    expect(note.linkMeta).toEqual([]);
  });
});

describe("review loop", () => {
  it("doubles the interval on review and caps it at 180d", async () => {
    const id = await createNote({ title: "R" });
    await setReviewInterval(id, 30);
    await markReviewed(id);
    expect((await db.notes.get(id))!.reviewInterval).toBe(60);
    await markReviewed(id);
    await markReviewed(id);
    const note = (await db.notes.get(id))!;
    expect(note.reviewInterval).toBe(180);
    expect(note.reviewCadence).toBe("every 180d");
    expect(note.lastReviewedAt).not.toBeNull();
  });
});

describe("archive and delete", () => {
  it("archive is reversible and keeps history", async () => {
    const id = await createNote({ title: "Keep" });
    await archiveNote(id);
    expect((await db.notes.get(id))!.archivedAt).not.toBeNull();
    await restoreNote(id);
    expect((await db.notes.get(id))!.archivedAt).toBeNull();
    const kinds = (await db.events.where("noteId").equals(id).toArray()).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["created", "archived", "restored"]));
  });

  it("deleting forever removes events and scrubs every inbound reference", async () => {
    const doomed = await createNote({ title: "Doomed" });
    const prose = await createNote({ title: "Prose ref" });
    const manual = await createNote({ title: "Manual ref" });
    await saveDoc(prose, para(wiki("Doomed")));
    await linkNotes(manual, doomed, { type: "related" });

    await deleteNoteForever(doomed);

    expect(await db.notes.get(doomed)).toBeUndefined();
    expect(await db.events.where("noteId").equals(doomed).count()).toBe(0);
    const p = (await db.notes.get(prose))!;
    expect(p.links).toEqual([]);
    expect(JSON.stringify(p.doc)).not.toContain(doomed);
    expect(p.text).toContain("Doomed"); // the words survive; only the link dies
    const m = (await db.notes.get(manual))!;
    expect(m.manualLinks).toEqual([]);
    expect(m.linkMeta).toEqual([]);
  });
});
