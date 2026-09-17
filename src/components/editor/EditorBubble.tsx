import { useEffect, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { normalizeUrl, urlHost } from "../../lib/url";
import { linkBus } from "../../lib/bus";

/**
 * The floating bar over a selection. Two jobs:
 *   - on selected text: turn it into an external link, or a Cadence task
 *   - with the caret inside a link: open, edit or remove it
 */
export function EditorBubble({
  editor,
  taskLabel,
  onMakeTask,
}: {
  editor: TiptapEditor;
  /** flash message replacing the task button's label after an attempt */
  taskLabel: string | null;
  onMakeTask: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  // shouldShow runs inside ProseMirror, outside React's render — read via ref
  const editingRef = useRef(false);
  editingRef.current = editing;

  const href = editor.getAttributes("link").href as string | undefined;

  const inputRef = useRef<HTMLInputElement>(null);
  // the menu may already be on screen (Link button) or still hidden (insert
  // menu → tippy mounts it a beat later, see onMount below) — focus in both
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // The bubble mounts a frame or two after it's asked for. A fast typist is
  // already on the URL by then — hold those keys for the field instead of
  // letting them land in the prose.
  useEffect(() => {
    const dom = editor.view.dom;
    const hold = (e: KeyboardEvent) => {
      if (!editingRef.current || document.activeElement === inputRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) setUrl((u) => u + e.key);
      else if (e.key === "Backspace") setUrl((u) => u.slice(0, -1));
      else if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
    };
    dom.addEventListener("keydown", hold, true);
    return () => dom.removeEventListener("keydown", hold, true);
  }, [editor]);

  const startEdit = () => {
    setUrl(href ?? "");
    setBad(false);
    // the menu plugin may ask shouldShow before React re-renders — tell it now
    editingRef.current = true;
    setEditing(true);
  };

  // "External link" from the insert menu: open straight into the URL field
  const startRef = useRef(startEdit);
  startRef.current = startEdit;
  useEffect(
    () =>
      linkBus.on(() => {
        if (!editor.isFocused) return; // several editors may be mounted; only the active one answers
        // the block's own doc change wakes the menu plugin, which re-runs shouldShow
        startRef.current();
      }),
    [editor]
  );

  const apply = () => {
    const clean = normalizeUrl(url);
    if (!clean) {
      setBad(true);
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link"))
      // nothing to wrap — the address itself becomes the linked text
      editor
        .chain()
        .focus()
        .insertContent([{ type: "text", text: clean, marks: [{ type: "link", attrs: { href: clean } }] }, { type: "text", text: " " }])
        .run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
    setEditing(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      // no debounce: after "External link" the URL field must be there before
      // the next keystroke, or that keystroke lands in the prose
      updateDelay={0}
      // stays inside the app root (tippy's default parent): the menu is a moved
      // DOM node, not a portal, so outside #root React never sees its events
      tippyOptions={{ duration: 100, maxWidth: "none", onMount: () => inputRef.current?.focus() }}
      shouldShow={({ editor, state }) => {
        if (editingRef.current) return true;
        if (editor.isActive("link")) return true;
        const { from, to } = state.selection;
        return to > from && state.doc.textBetween(from, to, " ").trim().length > 0;
      }}
    >
      <div className="loam-bubble">
        {editing ? (
          <>
            <input
              ref={inputRef}
              // leaving the field for anywhere but the bubble abandons the edit
              onBlur={(e) => {
                if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setEditing(false);
              }}
              className={"loam-bubble-input" + (bad ? " is-bad" : "")}
              value={url}
              placeholder="Paste or type a link…"
              aria-label="Link address"
              spellCheck={false}
              onChange={(e) => {
                setUrl(e.target.value);
                setBad(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                  editor.commands.focus();
                }
              }}
            />
            <button className="loam-bubble-btn" onMouseDown={(e) => (e.preventDefault(), apply())}>
              {bad ? "Not a link" : "Apply"}
            </button>
          </>
        ) : href ? (
          <>
            <a
              className="loam-bubble-btn loam-bubble-url"
              href={normalizeUrl(href) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={href}
            >
              {urlHost(href)} ↗
            </a>
            <span className="loam-bubble-sep" />
            <button className="loam-bubble-btn" onMouseDown={(e) => (e.preventDefault(), startEdit())}>
              Edit
            </button>
            <button
              className="loam-bubble-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
              }}
            >
              Unlink
            </button>
          </>
        ) : (
          <>
            <button className="loam-bubble-btn" onMouseDown={(e) => (e.preventDefault(), startEdit())}>
              Link
            </button>
            <span className="loam-bubble-sep" />
            <button className="loam-bubble-btn" onMouseDown={(e) => (e.preventDefault(), onMakeTask())}>
              {taskLabel ?? "→ Cadence task"}
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
