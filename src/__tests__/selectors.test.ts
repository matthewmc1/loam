import { describe, expect, it } from "vitest";
import { db } from "../db/db";
import { createNote, linkNotes, saveDoc, setAliases, archiveNote } from "../store/notes";
import { backlinksOf, liveNotes, pairKey, reviewDue, unlinkedMentions } from "../store/selectors";
import type { Note } from "../db/types";

const DAY = 86400000;
const prose = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

describe("reviewDue", () => {
  const now = Date.UTC(2026, 0, 1);
  const base = { status: "verified", reviewInterval: 30, lastReviewedAt: null, verifiedAt: null, snoozedUntil: null } as Note;

  it("is due once the interval has elapsed since the latest review or verification", () => {
    expect(reviewDue({ ...base, verifiedAt: now - 31 * DAY }, now)).toBe(true);
    expect(reviewDue({ ...base, verifiedAt: now - 31 * DAY, lastReviewedAt: now - 2 * DAY }, now)).toBe(false);
  });

  it("respects snooze, and notes without a schedule never come due", () => {
    expect(reviewDue({ ...base, verifiedAt: now - 99 * DAY, snoozedUntil: now + DAY }, now)).toBe(false);
    expect(reviewDue({ ...base, reviewInterval: null, verifiedAt: now - 999 * DAY }, now)).toBe(false);
  });

  it("surfaces 'needs review' status unless it was just reviewed", () => {
    const flagged = { ...base, status: "review", reviewInterval: null } as Note;
    expect(reviewDue(flagged, now)).toBe(true);
    expect(reviewDue({ ...flagged, lastReviewedAt: now - DAY }, now)).toBe(false);
  });
});

describe("graph selectors", () => {
  it("backlinks count prose and manual links, and archived notes drop out of live", async () => {
    const a = await createNote({ title: "A" });
    const b = await createNote({ title: "B" });
    const c = await createNote({ title: "C" });
    await linkNotes(b, a);
    await linkNotes(c, a);
    await archiveNote(c);
    const live = liveNotes(await db.notes.toArray());
    expect(backlinksOf(live, a).map((n) => n.id)).toEqual([b]);
  });

  it("pairKey is order-independent", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});

describe("unlinkedMentions", () => {
  it("finds titles and aliases typed without brackets, and skips already-connected notes", async () => {
    const spaced = await createNote({ title: "Spaced repetition" });
    await setAliases(spaced, ["SRS"]);
    const linked = await createNote({ title: "Already linked" });
    const writer = await createNote({ title: "Writer" });
    await saveDoc(writer, prose("I keep coming back to SRS, and to Already linked, when designing review.") as never);
    await linkNotes(writer, linked);

    const notes = await db.notes.toArray();
    const mentions = unlinkedMentions(notes, notes.find((n) => n.id === writer)!);
    expect(mentions.map((m) => m.note.id)).toEqual([spaced]);
  });
});
