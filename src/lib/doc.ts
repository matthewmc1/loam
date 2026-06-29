/**
 * Helpers for working with the Tiptap/ProseMirror JSON document that is the
 * source of truth for a note body.
 *
 * Two custom inline nodes are used by the editor:
 *   - wikiLink: { type: "wikiLink", attrs: { title, id } }
 *   - tag:      { type: "tag",      attrs: { name } }
 */

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export function emptyDoc(): PMNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Depth-first walk over every node. */
export function walk(node: PMNode | undefined, fn: (n: PMNode) => void): void {
  if (!node) return;
  fn(node);
  node.content?.forEach((c) => walk(c, fn));
}

/** Plaintext mirror of a doc — for search, previews and the AI surface. */
export function docToText(doc: PMNode | unknown): string {
  const out: string[] = [];
  walk(doc as PMNode, (n) => {
    if (n.type === "text" && n.text) out.push(n.text);
    else if (n.type === "wikiLink" && n.attrs?.title) out.push(String(n.attrs.title));
    else if (n.type === "tag" && n.attrs?.name) out.push("#" + String(n.attrs.name));
  });
  // join blocks with spaces; collapse runs of whitespace
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** All wikilink target titles referenced in a doc (deduped, in order). */
export function extractLinkTitles(doc: PMNode | unknown): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  walk(doc as PMNode, (n) => {
    if (n.type === "wikiLink" && n.attrs?.title) {
      const t = String(n.attrs.title).trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        titles.push(t);
      }
    }
  });
  return titles;
}

/** All inline #tags referenced in a doc (deduped). */
export function extractTags(doc: PMNode | unknown): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  walk(doc as PMNode, (n) => {
    if (n.type === "tag" && n.attrs?.name) {
      const t = String(n.attrs.name).trim().replace(/^#/, "");
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        tags.push(t);
      }
    }
  });
  return tags;
}

/** First non-empty paragraph as an excerpt. */
export function docExcerpt(doc: PMNode | unknown, max = 140): string {
  const text = docToText(doc);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function inlineToMd(nodes: PMNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") {
        let t = n.text ?? "";
        for (const m of n.marks ?? []) {
          if (m.type === "bold") t = `**${t}**`;
          else if (m.type === "italic") t = `*${t}*`;
          else if (m.type === "code") t = `\`${t}\``;
        }
        return t;
      }
      if (n.type === "wikiLink") return `[[${n.attrs?.title ?? ""}]]`;
      if (n.type === "tag") return `#${n.attrs?.name ?? ""}`;
      if (n.type === "hardBreak") return "\n";
      return "";
    })
    .join("");
}

/** Serialize a doc to portable Markdown (for export / file sync). */
export function docToMarkdown(doc: PMNode | unknown): string {
  const d = doc as PMNode;
  const lines: string[] = [];
  for (const block of d?.content ?? []) {
    switch (block.type) {
      case "heading": {
        const level = Number(block.attrs?.level ?? 1);
        lines.push(`${"#".repeat(level)} ${inlineToMd(block.content)}`);
        break;
      }
      case "paragraph":
        lines.push(inlineToMd(block.content));
        break;
      case "blockquote":
        for (const inner of block.content ?? [])
          lines.push(`> ${inlineToMd(inner.content)}`);
        break;
      case "bulletList":
        for (const li of block.content ?? [])
          for (const p of li.content ?? [])
            lines.push(`- ${inlineToMd(p.content)}`);
        break;
      case "orderedList":
        (block.content ?? []).forEach((li, i) => {
          for (const p of li.content ?? [])
            lines.push(`${i + 1}. ${inlineToMd(p.content)}`);
        });
        break;
      case "codeBlock":
        lines.push("```", inlineToMd(block.content), "```");
        break;
      default:
        lines.push(inlineToMd(block.content));
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}
