import { describe, expect, it } from "vitest";
import { db } from "../db/db";
import { assetIdsOf, base64ToBuffer, bufferToBase64, fitWithin, putAsset, sweepAssets } from "../lib/assets";
import { buildBackup, parseBackup, restoreBackup } from "../lib/backup";
import { createNote, saveDoc, setHero, setHeroPosition } from "../store/notes";
import { docToMarkdown, docToText, type PMNode } from "../lib/doc";

const bytes = (...n: number[]) => new Uint8Array(n).buffer;
const img = (data: ArrayBuffer, name = "") => putAsset({ data, mime: "image/png", width: 4, height: 2, name });
const figure = (assetId: string, caption = ""): PMNode => ({ type: "image", attrs: { assetId, caption } });
const DAY = 86400000;

describe("asset store", () => {
  it("stores identical bytes once", async () => {
    const a = await img(bytes(1, 2, 3), "a.png");
    const b = await img(bytes(1, 2, 3), "copy.png");
    const c = await img(bytes(9));
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
    expect(await db.assets.count()).toBe(2);
    expect(a.size).toBe(3);
  });

  it("fitWithin caps the long edge and never upscales", () => {
    expect(fitWithin(4800, 2400, 2400)).toEqual({ width: 2400, height: 1200 });
    expect(fitWithin(1000, 3000, 2400)).toEqual({ width: 800, height: 2400 });
    expect(fitWithin(640, 480, 2400)).toEqual({ width: 640, height: 480 });
  });

  it("base64 survives a round trip, including buffers past the chunk size", () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(new Uint8Array(base64ToBuffer(bufferToBase64(big.buffer)))).toEqual(big);
  });
});

describe("sweepAssets", () => {
  it("keeps what notes use (inline, hero, archived) and what's recent; deletes old orphans", async () => {
    const inline = await img(bytes(1));
    const hero = await img(bytes(2));
    const orphanOld = await img(bytes(3));
    const orphanNew = await img(bytes(4));
    const id = await createNote({ title: "With pictures" });
    await saveDoc(id, { type: "doc", content: [figure(inline.id, "A diagram")] });
    await setHero(id, hero.id);
    await db.assets.update(orphanOld.id, { createdAt: Date.now() - 2 * DAY });
    await db.assets.update(inline.id, { createdAt: Date.now() - 2 * DAY });
    await db.assets.update(hero.id, { createdAt: Date.now() - 2 * DAY });

    expect(await sweepAssets()).toBe(1);
    const left = (await db.assets.toCollection().primaryKeys()).sort();
    expect(left).toEqual([inline.id, hero.id, orphanNew.id].sort());

    const note = (await db.notes.get(id))!;
    expect(assetIdsOf(note).sort()).toEqual([inline.id, hero.id].sort());
    expect(docToText(note.doc)).toBe("A diagram");
    expect(docToMarkdown(note.doc)).toBe(`![A diagram](assets/${inline.id})\n`);
  });
});

describe("hero", () => {
  it("sets, repositions (clamped), resets position on change, and logs provenance", async () => {
    const a = await img(bytes(1));
    const b = await img(bytes(2));
    const id = await createNote({ title: "Covered" });
    await setHero(id, a.id);
    await setHeroPosition(id, 140);
    expect((await db.notes.get(id))!.heroPosition).toBe(100);
    await setHero(id, b.id);
    expect((await db.notes.get(id))!).toMatchObject({ heroAssetId: b.id, heroPosition: 50 });
    await setHero(id, null);
    const summaries = (await db.events.where("noteId").equals(id).toArray()).map((e) => e.summary);
    expect(summaries).toEqual(expect.arrayContaining(["cover image added", "cover image changed", "cover image removed"]));
  });
});

describe("backup with images", () => {
  it("round-trips asset bytes, and still reads a v1 file that has none", async () => {
    const a = await img(bytes(7, 8, 9), "pic.png");
    const id = await createNote({ title: "Covered" });
    await setHero(id, a.id);
    const json = JSON.stringify(await buildBackup());
    expect(json).not.toContain("[object"); // bytes were encoded, not stringified away

    await db.assets.clear();
    await restoreBackup(parseBackup(json));
    const back = (await db.assets.get(a.id))!;
    expect(new Uint8Array(back.data)).toEqual(new Uint8Array([7, 8, 9]));
    expect((await db.notes.get(id))!.heroAssetId).toBe(a.id);

    const v1 = parseBackup(JSON.stringify({ format: "loam-vault", version: 1, notes: [{ id: "x", title: "old" }], folders: [] }));
    expect(v1.assets).toEqual([]);
    expect(v1.notes[0]).toMatchObject({ heroAssetId: null, heroPosition: 50 });
  });
});
