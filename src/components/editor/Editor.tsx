import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor as TiptapEditor, Range, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { Note } from "../../db/types";
import { STATUS_COLOR } from "../../db/types";
import { saveDoc, logEvent } from "../../store/notes";
import { useUI } from "../../store/ui";
import { useCadence } from "../../cadence/store";
import { loamNoteUrl } from "../../cadence/config";
import type { PMNode } from "../../lib/doc";
import { WikiLink, Tag } from "./extensions";
import { makeSuggestion } from "./suggestion";
import { EditorBubble } from "./EditorBubble";
import { Decision } from "./Decision";
import { InsertMenu } from "./InsertMenu";
import { normalizeUrl } from "../../lib/url";
import type { SuggestionItem } from "./SuggestionList";
import "./editor.css";

export function Editor({ note, notes }: { note: Note; notes: Note[] }) {
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const pending = useRef<PMNode | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // if the vault was replaced (import/restore) after this editor mounted, its
  // buffered content is pre-restore data — flushing it would overwrite the
  // freshly restored note
  const mountEpoch = useRef(useUI.getState().vaultEpoch);

  // Set when the stored doc doesn't fit this build's schema (a newer Loam wrote
  // a block this one doesn't know — e.g. a stale cached PWA). Tiptap then loads
  // a blank doc; saving that would erase the note, so this editor never saves.
  const [unreadable, setUnreadable] = useState(false);
  const unreadableRef = useRef(false);

  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (unreadableRef.current) {
      pending.current = null;
      return;
    }
    if (useUI.getState().vaultEpoch !== mountEpoch.current) {
      pending.current = null;
      return;
    }
    if (pending.current) {
      void saveDoc(note.id, pending.current);
      pending.current = null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: "Start writing — [[ links a note, # tags, / or ⌘K inserts…",
      }),
      // external links: typed/pasted URLs link themselves; pasting a URL over a
      // selection links the selection. Clicking only places the caret (this is
      // an editor) — the bubble, or ⌘/ctrl-click, opens it.
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow", class: "loam-extlink" },
        isAllowedUri: (url) => normalizeUrl(url) != null,
      }),
      Decision.configure({ noteId: note.id }),
      InsertMenu,
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
    enableContentCheck: true,
    onContentError: ({ error }) => {
      console.error("[loam] note content doesn't match this version's schema — editor locked", error);
      // the ref blocks saving immediately; the rest waits, because this fires
      // mid-construction (no view yet, and we're inside React's render)
      unreadableRef.current = true;
      queueMicrotask(() => setUnreadable(true));
    },
    autofocus: note.text.trim() === "" ? "end" : false,
    editorProps: {
      attributes: { class: "ProseMirror", spellcheck: "true" },
      handleDOMEvents: {
        click: (_view, e) => {
          const a = (e.target as HTMLElement).closest?.("a.loam-extlink");
          if (!a) return false;
          e.preventDefault(); // never navigate this tab away from the vault
          const href = normalizeUrl(a.getAttribute("href") ?? "");
          if (href && (e.metaKey || e.ctrlKey)) window.open(href, "_blank", "noopener,noreferrer");
          return false;
        },
      },
    },
    onUpdate: ({ editor }) => {
      if (unreadableRef.current) return;
      pending.current = editor.getJSON() as PMNode;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 600);
    },
  });

  useEffect(() => {
    if (unreadable && editor && !editor.isDestroyed) editor.setEditable(false);
  }, [unreadable, editor]);

  // selection → Cadence task
  const [flash, setFlash] = useState<string | null>(null);
  const makeTask = async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ").trim();
    if (!text) return;
    const cad = useCadence.getState();
    // offline still works — the store queues the create in the outbox
    if (cad.status !== "connected" && cad.status !== "offline") {
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
        data: { taskId: task.id, ...(task.pending ? { queued: true } : {}) },
      });
      setFlash(task.pending ? "Queued — will sync ↺" : "Added to Cadence ✓");
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
    <>
      {/* kept outside .loam-prose: the bubble menu detaches its node from that
          div, so React can't safely insert a new sibling in front of it */}
      {unreadable && (
        <div className="loam-unreadable" role="alert">
          This note uses something this version of Loam can’t display, so editing is locked to keep it
          intact. Reload to update Loam — your note is untouched.
        </div>
      )}
      <div className="loam-prose">
        {editor && <EditorBubble editor={editor} taskLabel={flash} onMakeTask={() => void makeTask()} />}
        <EditorContent editor={editor} />
      </div>
    </>
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
