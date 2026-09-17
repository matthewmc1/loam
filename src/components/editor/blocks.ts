/**
 * The block registry — everything that can be dropped into a note from the
 * insert menu ("/" or ⌘K in the editor). One flat list of definitions, so a
 * new kind of sub-object (or, later, a user-authored template loaded from the
 * vault) is an entry here rather than new menu plumbing.
 */
import type { Editor, JSONContent, Range } from "@tiptap/core";
import { uid } from "../../lib/id";
import { linkBus } from "../../lib/bus";
import { useUI } from "../../store/ui";
import { insertImages, pickImages } from "./Image";

export interface BlockDef {
  id: string;
  label: string;
  /** one-line description shown beside the label */
  hint: string;
  group: "Link" | "Media" | "Structure" | "Template" | "Go";
  /** extra words the filter should match */
  keywords?: string;
  /** `range` covers the typed "/query" — every block starts by replacing it */
  run(editor: Editor, range: Range): void;
}

const h = (text: string): JSONContent => ({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }] });
const p = (): JSONContent => ({ type: "paragraph" });
const ul = (): JSONContent => ({ type: "bulletList", content: [{ type: "listItem", content: [p()] }] });

/** A template is just content — a function, so ids and dates are fresh per insert. */
function template(id: string, label: string, hint: string, keywords: string, content: () => JSONContent[]): BlockDef {
  return {
    id,
    label,
    hint,
    keywords,
    group: "Template",
    run: (editor, range) => {
      editor.chain().focus().insertContentAt(range, content()).run();
    },
  };
}

export const decisionContent = (): JSONContent => ({
  type: "decision",
  attrs: { id: uid("dec"), status: "open", decidedAt: null },
  content: [p(), h("Context"), p(), h("Options"), ul(), h("Outcome"), p()],
});

export const BLOCKS: BlockDef[] = [
  {
    id: "note-link",
    label: "Link to note",
    hint: "[[",
    group: "Link",
    keywords: "wikilink internal reference backlink",
    // hand over to the [[ autocomplete rather than reimplementing note search
    run: (editor, range) => void editor.chain().focus().insertContentAt(range, "[[").run(),
  },
  {
    id: "external-link",
    label: "External link",
    hint: "URL to a source",
    group: "Link",
    keywords: "url web href source cite reference",
    run: (editor, range) => {
      // order matters: the bubble decides whether to show *during* the next doc
      // change, so it has to know a link is being written before "/…" is removed
      linkBus.emit();
      editor.chain().deleteRange(range).run();
    },
  },
  {
    id: "tag",
    label: "Tag",
    hint: "#",
    group: "Link",
    keywords: "hashtag topic",
    run: (editor, range) => void editor.chain().focus().insertContentAt(range, "#").run(),
  },
  {
    id: "image",
    label: "Image",
    hint: "Or paste / drop one",
    group: "Media",
    keywords: "picture photo screenshot figure diagram upload",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      void pickImages().then((files) => insertImages(editor, files));
    },
  },
  {
    id: "decision",
    label: "Decision",
    hint: "Tracked: open → decided",
    group: "Template",
    keywords: "decision log adr choice outcome",
    run: (editor, range) => {
      const block = decisionContent();
      editor.chain().focus().insertContentAt(range, [block, p()]).run();
      // insertContentAt leaves the caret after what it inserted; a decision
      // wants its first line — "what are we deciding?" — written straight away
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "decision" || node.attrs.id !== block.attrs?.id) return true;
        editor.commands.setTextSelection(pos + 2);
        return false;
      });
    },
  },
  template("questions", "Open questions", "What’s still unknown", "unknowns todo follow-up", () => [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Open questions" }] },
    ul(),
  ]),
  template("lit-summary", "Literature summary", "Claim · evidence · my take", "source book paper article reading", () => [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Claim" }] },
    p(),
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Evidence" }] },
    ul(),
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "My take" }] },
    p(),
  ]),
  template("meeting", "Meeting notes", "Attendees · notes · actions", "call sync minutes agenda", () => [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Attendees" }] },
    p(),
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] },
    ul(),
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Actions" }] },
    ul(),
  ]),
  {
    id: "section",
    label: "Section label",
    hint: "Heading",
    group: "Structure",
    keywords: "h2 heading title",
    run: (editor, range) => void editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Pull-quote",
    group: "Structure",
    keywords: "blockquote citation",
    run: (editor, range) => void editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    id: "list",
    label: "Bullet list",
    hint: "•",
    group: "Structure",
    keywords: "ul unordered",
    run: (editor, range) => void editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "—",
    group: "Structure",
    keywords: "hr rule separator",
    run: (editor, range) => void editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "search",
    label: "Search notes…",
    hint: "⌘K again",
    group: "Go",
    keywords: "find open palette jump",
    run: (editor, range) => {
      editor.chain().deleteRange(range).run();
      useUI.getState().setSearchOpen(true);
    },
  },
];

export function filterBlocks(query: string, blocks: BlockDef[] = BLOCKS): BlockDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  return blocks.filter((b) => (b.label + " " + (b.keywords ?? "") + " " + b.group).toLowerCase().includes(q));
}
