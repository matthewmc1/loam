import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import type { Editor as TiptapEditor, Range, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { Note } from "../../db/types";
import { STATUS_COLOR } from "../../db/types";
import { saveDoc, logEvent } from "../../store/notes";
import { useCadence } from "../../cadence/store";
import { loamNoteUrl } from "../../cadence/config";
import type { PMNode } from "../../lib/doc";
import { WikiLink, Tag } from "./extensions";
import { makeSuggestion } from "./suggestion";
import type { SuggestionItem } from "./SuggestionList";
import "./editor.css";

export function Editor({ note, notes }: { note: Note; notes: Note[] }) {
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const pending = useRef<PMNode | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (pending.current) {
      void saveDoc(note.id, pending.current);
      pending.current = null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: "Start writing — type [[ to link a note, # to tag…",
      }),
      WikiLink.configure({
        suggestion: makeSuggestion({
          char: "[[",
          allowSpaces: true,
          getItems: (q) => wikiItems(notesRef.current, note.id, q),
          onSelect: insertWiki,
        }),
      }),
      Tag.configure({
        suggestion: makeSuggestion({
          char: "#",
          allowSpaces: false,
          getItems: (q) => tagItems(notesRef.current, q),
          onSelect: insertTag,
        }),
      }),
    ],
    content: note.doc as JSONContent,
    autofocus: note.text.trim() === "" ? "end" : false,
    editorProps: {
      attributes: { class: "ProseMirror", spellcheck: "true" },
    },
    onUpdate: ({ editor }) => {
      pending.current = editor.getJSON() as PMNode;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 600);
    },
  });

  // selection → Cadence task
  const [flash, setFlash] = useState<string | null>(null);
  const makeTask = async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ").trim();
    if (!text) return;
    const cad = useCadence.getState();
    if (cad.status !== "connected") {
      cad.setPanel(true);
      return;
    }
    const title = text.length > 120 ? text.slice(0, 117) + "…" : text;
    // Permanent notes and Maps of Content are settled, load-bearing thinking —
    // carry that maturity across the bridge so Cadence's importance axis + deep
    // lane defend it. (note.confidence is also available here for future tuning.)
    const deep = note.type === "Permanent" || note.type === "Map of Content";
    const label = deep ? `${note.type} · ${note.title}` : note.title;
    const task = await cad.createTask({
      title,
      status: "backlog",
      note: `From Loam note “${note.title}”`,
      links: [{ label, url: loamNoteUrl(note.id) }],
      ...(deep ? { important: true, kind: "deep" } : {}),
    });
    if (task) {
      void logEvent(note.id, "task_created", `task created in Cadence: “${title}”`, {
        data: { taskId: task.id },
      });
      setFlash("Added to Cadence ✓");
    } else {
      const m = useCadence.getState().msg;
      setFlash(m ? `✕ ${m.slice(0, 48)}` : "Couldn’t add — check Cadence");
    }
    window.setTimeout(() => setFlash(null), 2400);
  };

  // flush the last edit when leaving this note
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // save on tab close too (bound once per editor instance)
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("beforeunload", onHide);
    return () => window.removeEventListener("beforeunload", onHide);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="loam-prose">
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          shouldShow={({ state }) => {
            const { from, to } = state.selection;
            return to > from && state.doc.textBetween(from, to, " ").trim().length > 0;
          }}
        >
          <button
            className="loam-bubble"
            onMouseDown={(e) => {
              e.preventDefault();
              void makeTask();
            }}
          >
            {flash ?? "→ Cadence task"}
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

/* ----------------------------- suggestions ------------------------------ */

function wikiItems(notes: Note[], selfId: string, query: string): SuggestionItem[] {
  const q = query.trim().toLowerCase();
  const items: SuggestionItem[] = notes
    .filter((n) => !n.archivedAt && n.id !== selfId)
    .filter((n) => !q || n.title.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 7)
    .map((n) => ({
      id: n.id,
      primary: n.title,
      secondary: n.type,
      dotColor: STATUS_COLOR[n.status],
      value: n.title,
    }));
  if (q)
    items.push({
      id: "__create__",
      primary: `Create “${query.trim()}”`,
      value: query.trim(),
      isCreate: true,
    });
  return items;
}

function tagItems(notes: Note[], query: string): SuggestionItem[] {
  const q = query.trim().toLowerCase();
  const all = Array.from(new Set(notes.flatMap((n) => n.tags))).sort();
  const items: SuggestionItem[] = all
    .filter((t) => !q || t.toLowerCase().includes(q))
    .slice(0, 7)
    .map((t) => ({ id: "tag_" + t, primary: t, value: t }));
  if (q && !all.some((t) => t.toLowerCase() === q))
    items.unshift({
      id: "__newtag__",
      primary: `Create #${query.trim()}`,
      value: query.trim(),
      isCreate: true,
    });
  return items;
}

function insertWiki(item: SuggestionItem, editor: TiptapEditor, range: Range) {
  const title = item.value ?? item.primary;
  const id = item.isCreate ? null : item.id;
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: "wikiLink", attrs: { id, title, label: title } },
      { type: "text", text: " " },
    ])
    .run();
}

function insertTag(item: SuggestionItem, editor: TiptapEditor, range: Range) {
  const name = (item.value ?? item.primary).replace(/^#/, "");
  editor
    .chain()
    .focus()
    .insertContentAt(range, [{ type: "tag", attrs: { name } }, { type: "text", text: " " }])
    .run();
}
