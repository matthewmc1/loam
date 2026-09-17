import { describe, expect, it } from "vitest";
import { dayKey, lastActiveDay, narrate, startOfDay, type NarrativeLine } from "../lib/narrative";
import type { EventKind, Note, ProvenanceEvent } from "../db/types";

const DAY = 86400000;
const today = startOfDay(new Date(2026, 8, 17, 12).getTime());
const note = (id: string, title: string) => ({ id, title }) as Note;
let seq = 0;
const ev = (noteId: string, kind: EventKind, hour: number, extra: Partial<ProvenanceEvent> = {}): ProvenanceEvent => ({
  id: `e${seq++}`,
  noteId,
  ts: today + hour * 3600000,
  kind,
  summary: kind,
  ...extra,
});
const flat = (l: NarrativeLine) => l.parts.map((p) => (typeof p === "string" ? p : `[${p.title}]`)).join("");

const notes = [note("a", "Alpha"), note("b", "Beta"), note("c", "Gamma"), note("d", "Delta"), note("e", "Epsilon")];

describe("narrate", () => {
  it("tells the day in order of meaning, and names notes as links", () => {
    const events = [
      ev("a", "created", 9),
      ev("a", "edited", 9.1), // editing a note you started today isn't separate news
      ev("b", "edited", 10),
      ev("b", "edited", 11),
      ev("a", "linked", 12, { relatedNoteId: "b" }),
      ev("c", "verified", 13),
      ev("b", "decision_changed", 13.5, { summary: "decision reversed: “Use IndexedDB”", data: { decisionId: "d1", to: "reversed" } }),
      ev("b", "decision_changed", 14, { summary: "decision decided: “Use IndexedDB”", data: { decisionId: "d1", to: "decided" } }),
      ev("b", "ref_added", 15),
      ev("b", "ref_added", 15.1),
      ev("a", "task_created", 16),
      ev("x", "edited", 16), // deleted note — silently skipped
      ev("d", "edited", -5), // yesterday
    ];
    expect(narrate(events, notes, today, today + DAY).map(flat)).toEqual([
      "Decided “Use IndexedDB” in [Beta]",
      "Started 1 note: [Alpha]",
      "Worked on [Beta]",
      "Connected [Alpha] → [Beta]",
      "Verified [Gamma]",
      "Cited 2 sources in [Beta]",
      "Sent 1 task to Cadence",
    ]);
  });

  it("caps long lists", () => {
    const events = notes.map((n, i) => ev(n.id, "edited", i));
    expect(narrate(events, notes, today, today + DAY).map(flat)).toEqual(["Worked on [Alpha], [Beta], [Gamma] and 2 more"]);
  });

  it("is empty for a quiet day; lastActiveDay finds the previous one", () => {
    const events = [ev("a", "edited", -30)];
    expect(narrate(events, notes, today, today + DAY)).toEqual([]);
    expect(lastActiveDay(events, today)).toBe(today - 2 * DAY);
    expect(lastActiveDay([], today)).toBeNull();
    expect(dayKey(today)).toBe("2026-09-17");
  });
});
