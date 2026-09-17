import { describe, expect, it } from "vitest";
import { db } from "../db/db";
import { addRef, createNote, removeRef, renameRef } from "../store/notes";
import { docToMarkdown, docToText, extractExternalLinks, type PMNode } from "../lib/doc";
import { isUrl, normalizeUrl, urlHost, urlKey, urlLabel } from "../lib/url";

const linked = (text: string, href: string, extra: { type: string }[] = []): PMNode => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }, ...extra],
});
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content: [{ type: "paragraph", content }] });

describe("normalizeUrl", () => {
  it("accepts web and mail addresses, adding https to bare domains", () => {
    expect(normalizeUrl("example.com/a")).toBe("https://example.com/a");
    expect(normalizeUrl("  http://example.com  ")).toBe("http://example.com/");
    expect(normalizeUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(normalizeUrl("http://localhost:8088/x")).toBe("http://localhost:8088/x");
  });

  it("refuses script URLs, other schemes, prose and typos", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "file:///etc/passwd", "not a link", "justaword", ""])
      expect(normalizeUrl(bad), bad).toBeNull();
  });

  it("isUrl only fires on a field that is nothing but a URL", () => {
    expect(isUrl("https://example.com/paper.pdf")).toBe(true);
    expect(isUrl("www.example.com")).toBe(true);
    expect(isUrl("Board memo")).toBe(false);
    expect(isUrl("see https://example.com")).toBe(false);
  });

  it("labels and dedupe keys", () => {
    expect(urlHost("https://www.example.com/x")).toBe("example.com");
    expect(urlLabel("https://www.example.com/docs/intro/")).toBe("example.com/docs/intro");
    expect(urlKey("https://www.example.com/a/#top")).toBe(urlKey("http://example.com/a"));
    expect(urlKey("https://example.com/a?v=1")).not.toBe(urlKey("https://example.com/a?v=2"));
  });
});

describe("links in prose", () => {
  const d = doc(
    { type: "text", text: "Read " },
    linked("the ", "https://example.com/paper"),
    linked("paper", "https://example.com/paper", [{ type: "bold" }]),
    { type: "text", text: " or " },
    linked("https://other.org/", "https://other.org/")
  );

  it("are extracted once per URL, rejoining text split by other marks", () => {
    expect(extractExternalLinks(d)).toEqual([
      { url: "https://example.com/paper", text: "the paper" },
      { url: "https://other.org/", text: "https://other.org/" },
    ]);
  });

  it("export to markdown and stay searchable as plain text", () => {
    expect(docToMarkdown(d)).toBe(
      "Read [the ](https://example.com/paper)[**paper**](https://example.com/paper) or <https://other.org/>\n"
    );
    expect(docToText(d)).toContain("the paper");
  });
});

describe("attached sources", () => {
  it("adds normalized, refuses junk and duplicates, renames, removes — with provenance", async () => {
    const id = await createNote({ title: "Cited" });
    expect(await addRef(id, "example.com/paper", "  The paper ")).toBe(true);
    expect(await addRef(id, "https://www.example.com/paper/")).toBe(false);
    expect(await addRef(id, "javascript:alert(1)")).toBe(false);

    let note = (await db.notes.get(id))!;
    expect(note.refs).toHaveLength(1);
    expect(note.refs[0]).toMatchObject({ url: "https://example.com/paper", title: "The paper" });

    await renameRef(id, note.refs[0].id, "Renamed");
    expect((await db.notes.get(id))!.refs[0].title).toBe("Renamed");

    await removeRef(id, note.refs[0].id);
    note = (await db.notes.get(id))!;
    expect(note.refs).toEqual([]);
    const kinds = (await db.events.where("noteId").equals(id).toArray()).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["ref_added", "ref_removed"]));
  });
});
