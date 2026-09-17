import { describe, expect, it } from "vitest";
import { extractDecisions } from "../lib/decisions";
import { docToMarkdown, docToText, type PMNode } from "../lib/doc";
import { BLOCKS, decisionContent, filterBlocks } from "../components/editor/blocks";

const t = (text: string): PMNode => ({ type: "text", text });
const para = (text?: string): PMNode => (text ? { type: "paragraph", content: [t(text)] } : { type: "paragraph" });
const decision = (attrs: Record<string, unknown>, ...content: PMNode[]): PMNode => ({ type: "decision", attrs, content });

describe("extractDecisions", () => {
  it("reads status, date and the first line as the statement — nested or not", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        para("intro"),
        decision({ id: "d1", status: "decided", decidedAt: 1700000000000 }, para("Use IndexedDB"), para("because local-first")),
        { type: "blockquote", content: [decision({ id: "d2", status: "open", decidedAt: null }, para())] },
        decision({ id: "d3", status: "nonsense" }, para("Bad status falls back")),
      ],
    };
    expect(extractDecisions(doc)).toEqual([
      { id: "d1", status: "decided", decidedAt: 1700000000000, statement: "Use IndexedDB" },
      { id: "d2", status: "open", decidedAt: null, statement: "Untitled decision" },
      { id: "d3", status: "open", decidedAt: null, statement: "Bad status falls back" },
    ]);
  });

  it("decision text stays searchable, and exports as a quoted callout", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        decision(
          { id: "d1", status: "decided", decidedAt: Date.UTC(2026, 8, 17) },
          para("Use IndexedDB"),
          { type: "heading", attrs: { level: 3 }, content: [t("Context")] },
          para("No server.")
        ),
      ],
    };
    expect(docToText(doc)).toContain("Use IndexedDB");
    expect(docToMarkdown(doc)).toBe(
      "> **Decision — decided · 2026-09-17**\n> Use IndexedDB\n>\n> ### Context\n>\n> No server.\n"
    );
  });
});

describe("block registry", () => {
  it("has unique ids and filters on label, keywords and group", () => {
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length);
    expect(filterBlocks("adr").map((b) => b.id)).toEqual(["decision"]);
    expect(filterBlocks("url").map((b) => b.id)).toEqual(["external-link"]);
    expect(filterBlocks("template").length).toBeGreaterThan(2);
    expect(filterBlocks("")).toHaveLength(BLOCKS.length);
  });

  it("every inserted decision gets its own id and starts open", () => {
    const a = decisionContent();
    const b = decisionContent();
    expect(a.attrs?.id).not.toBe(b.attrs?.id);
    expect(a.attrs?.status).toBe("open");
    expect(extractDecisions({ type: "doc", content: [a] })[0].statement).toBe("Untitled decision");
  });
});
