import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { makeSuggestion } from "./suggestion";
import { BLOCKS, filterBlocks } from "./blocks";
import { useUI } from "../../store/ui";

const TRIGGER = "/";

/**
 * The insert menu: "/" at the start of a word lists every block in the
 * registry. ⌘K inside the editor types the "/" for you — so one shortcut
 * means "add something here" in a note and "find something" everywhere else.
 * ⌘K a second time (menu open, nothing typed) falls through to search.
 */
export const InsertMenu = Extension.create({
  name: "insertMenu",

  addKeyboardShortcuts() {
    return {
      "Mod-k": ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false; // a selection wants the bubble (Link), not an insert
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
        if (before.endsWith(TRIGGER)) {
          editor.chain().deleteRange({ from: $from.pos - 1, to: $from.pos }).run();
          useUI.getState().setSearchOpen(true);
          return true;
        }
        if ($from.parent.type.spec.code) return false;
        // the suggestion plugin only fires after whitespace / at line start
        const needsSpace = before.length > 0 && !/\s$/.test(before);
        editor.chain().focus().insertContent((needsSpace ? " " : "") + TRIGGER).run();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("insertMenu"),
        ...makeSuggestion({
          char: TRIGGER,
          allowSpaces: false,
          getItems: (q) =>
            filterBlocks(q).map((b) => ({ id: b.id, primary: b.label, secondary: b.hint })),
          onSelect: (item, editor, range) => BLOCKS.find((b) => b.id === item.id)?.run(editor, range),
        }),
      }),
    ];
  },
});
