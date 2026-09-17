import { describe, expect, it } from "vitest";
import { db } from "../db/db";
import { buildBackup, normalizeNote, parseBackup, restoreBackup } from "../lib/backup";
import { createNote, linkNotes, dismissForever } from "../store/notes";
import type { Note } from "../db/types";

describe("vault backup", () => {
  it("round-trips notes, events and dismissals through JSON", async () => {
    const a = await createNote({ title: "A" });
    const b = await createNote({ title: "B" });
    await linkNotes(a, b, { type: "extends" });
    await dismissForever("sugg_x_y");
    const before = await buildBackup();

    const json = JSON.stringify(before);
    await createNote({ title: "Made after the backup" });
    await restoreBackup(parseBackup(json));

    const after = await buildBackup();
    expect(after.notes).toEqual(before.notes);
    expect(after.events).toEqual(before.events);
    expect(after.dismissals).toEqual(before.dismissals);
  });

  it("clears vectors so embeddings recompute against restored notes", async () => {
    await db.vectors.put({ id: "stale", model: "m", hash: "h", vector: [1] } as never);
    await restoreBackup(parseBackup(JSON.stringify(await buildBackup())));
    expect(await db.vectors.count()).toBe(0);
  });

  it("rejects non-JSON, foreign files and exports from a newer Loam", () => {
    expect(() => parseBackup("nope")).toThrow(/isn't JSON/);
    expect(() => parseBackup(JSON.stringify({ notes: [] }))).toThrow(/isn't a Loam vault/);
    expect(() =>
      parseBackup(JSON.stringify({ format: "loam-vault", version: 99, notes: [], folders: [] }))
    ).toThrow(/newer Loam/);
  });

  it("upgrades notes from exports that predate later fields", () => {
    const old = { id: "n1", title: "Old", reviewCadence: "every 30d", tags: ["x"] } as unknown as Note;
    const parsed = parseBackup(JSON.stringify({ format: "loam-vault", version: 1, notes: [old], folders: [] }));
    const n = parsed.notes[0];
    expect(n.reviewInterval).toBe(30);
    expect(n.linkMeta).toEqual([]);
    expect(n.aliases).toEqual([]);
    expect(n.manualLinks).toEqual([]);
    expect(n.snoozedUntil).toBeNull();
    expect(n.tags).toEqual(["x"]);
    expect(parsed.events).toEqual([]);
  });

  it("normalizeNote leaves a current note untouched", async () => {
    const id = await createNote({ title: "Current" });
    const note = (await db.notes.get(id))!;
    expect(normalizeNote(note)).toEqual(note);
  });
});
