import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { navBus, tagBus } from "../../lib/bus";

/* ------------------------------- WikiLink ------------------------------- */

interface WikiLinkOptions {
  suggestion: Omit<SuggestionOptions, "editor">;
}

function WikiLinkView(props: { node: { attrs: Record<string, unknown> } }) {
  const id = props.node.attrs.id as string | null;
  const title = String(props.node.attrs.title ?? "");
  const label = String(props.node.attrs.label ?? title) || title;
  const pending = !id;
  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <span
        className={pending ? "" : "lk"}
        contentEditable={false}
        role="link"
        tabIndex={0}
        onClick={() => navBus.emit({ id, title })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navBus.emit({ id, title });
          }
        }}
        title={pending ? `Pending — “${title}” isn’t a note yet` : title}
        style={{
          font: "inherit",
          color: pending ? "var(--text-muted)" : "var(--text-strong)",
          fontWeight: pending ? 400 : 470,
          background: pending ? "transparent" : "var(--link-bg)",
          border: "none",
          borderBottom: pending
            ? "1px dashed var(--text-fainter)"
            : "1px solid var(--link-border)",
          borderRadius: pending ? 0 : "0.32em",
          padding: pending ? "0 0.04em" : "0.04em 0.32em 0.06em",
          margin: "0 0.03em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background 130ms var(--ease)",
        }}
      >
        {label}
      </span>
    </NodeViewWrapper>
  );
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      suggestion: {
        char: "[[",
        allowSpaces: true,
      } as Omit<SuggestionOptions, "editor">,
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      title: { default: "" },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wikilink": "",
        "data-id": node.attrs.id ?? "",
        "data-title": node.attrs.title ?? "",
      }),
      `${node.attrs.label ?? node.attrs.title ?? ""}`,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.title ?? ""}]]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        ...this.options.suggestion,
      }),
    ];
  },
});

/* --------------------------------- Tag ---------------------------------- */

interface TagOptions {
  suggestion: Omit<SuggestionOptions, "editor">;
}

function TagView(props: { node: { attrs: Record<string, unknown> } }) {
  const name = String(props.node.attrs.name ?? "");
  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <span
        contentEditable={false}
        onClick={() => tagBus.emit(name)}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.82em",
          letterSpacing: "0.01em",
          color: "var(--text-500)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "var(--text-ghost)" }}>#</span>
        {name}
      </span>
    </NodeViewWrapper>
  );
}

export const Tag = Node.create<TagOptions>({
  name: "tag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      suggestion: { char: "#", allowSpaces: false } as Omit<SuggestionOptions, "editor">,
    };
  },

  addAttributes() {
    return { name: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-tag]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-tag": "", "data-name": node.attrs.name ?? "" }),
      `#${node.attrs.name ?? ""}`,
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.name ?? ""}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(TagView);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("tagSuggestion"),
        ...this.options.suggestion,
      }),
    ];
  },
});
