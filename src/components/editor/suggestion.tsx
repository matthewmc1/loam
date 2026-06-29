import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { Editor, Range } from "@tiptap/core";
import type { SuggestionOptions } from "@tiptap/suggestion";
import {
  SuggestionList,
  type SuggestionItem,
  type SuggestionListHandle,
} from "./SuggestionList";

/**
 * Build a Tiptap Suggestion config that renders our React popup. Generic over
 * both [[wikilink]] and #tag triggers.
 */
export function makeSuggestion(opts: {
  char: string;
  allowSpaces?: boolean;
  getItems: (query: string) => SuggestionItem[];
  onSelect: (item: SuggestionItem, editor: Editor, range: Range) => void;
}): Omit<SuggestionOptions, "editor"> {
  return {
    char: opts.char,
    allowSpaces: opts.allowSpaces ?? false,
    startOfLine: false,
    items: ({ query }) => opts.getItems(query),
    command: ({ editor, range, props }) => {
      opts.onSelect(props as SuggestionItem, editor, range);
    },
    render: () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      let handleRef: SuggestionListHandle | null = null;

      const position = (rect: DOMRect | null) => {
        if (!container || !rect) return;
        const margin = 6;
        const top = rect.bottom + margin;
        container.style.left = `${Math.round(rect.left)}px`;
        // keep within viewport vertically
        const maxTop = window.innerHeight - 300;
        container.style.top = `${Math.round(Math.min(top, maxTop))}px`;
      };

      const paint = (props: { items: SuggestionItem[]; command: (i: SuggestionItem) => void; clientRect?: (() => DOMRect | null) | null }) => {
        if (!root) return;
        root.render(
          createElement(SuggestionList, {
            ref: (r: SuggestionListHandle | null) => {
              handleRef = r;
            },
            items: props.items,
            command: props.command,
          })
        );
        position(props.clientRect?.() ?? null);
      };

      return {
        onStart: (props) => {
          container = document.createElement("div");
          container.style.position = "fixed";
          container.style.zIndex = "1000";
          document.body.appendChild(container);
          root = createRoot(container);
          paint(props);
        },
        onUpdate: (props) => paint(props),
        onKeyDown: (props) => {
          if (props.event.key === "Escape") return false;
          return handleRef?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          // defer unmount: onExit fires inside a ProseMirror dispatch, and
          // unmounting a React root synchronously there triggers flushSync warnings
          const r = root;
          const c = container;
          root = null;
          container = null;
          handleRef = null;
          queueMicrotask(() => {
            r?.unmount();
            c?.remove();
          });
        },
      };
    },
  };
}
