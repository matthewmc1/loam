# Loam

A **local-first knowledge base** for compounding knowledge over time. Loam is built
for *note-taking as thinking* — Zettelkasten-style atomic notes, dense linking, and
metadata that tracks how your understanding evolves. Not a task manager; a place where
knowledge accretes.

> Write notes you can link, not notes you can file.

Everything lives on your device (IndexedDB). No account, no server, no sync-to-cloud.

## Principles

- **Density over volume.** A note's value is a function of how many others it touches.
- **Provenance is first-class.** Every change — created, edited, verified, linked,
  split, flagged — is recorded in an append-only log, so you can see *how* an idea
  evolved and what it descended from.
- **Retrieval is the product.** Resurfacing, spaced review, and contradiction
  detection keep knowledge alive — "activation happens on day two."
- **Maturity, not folders alone.** A note has a *type* (Fleeting → Literature →
  Permanent → Map of Content) separate from where it's filed.

## Features

- **Notes** with a rich Tiptap editor: headings, quotes, lists, code, and inline
  `[[wikilinks]]` + `#tags` with live autocomplete. Links that don't resolve yet
  become "unlinked mentions" you can turn into notes in one click.
- **Metadata you can edit** in the inspector: type, status, source, confidence,
  review cadence, verified/created dates, the Zettelkasten id, and arbitrary custom
  properties. Every edit is logged to provenance.
- **Folders** — nestable, colored, user-created — for organizing the vault, with
  per-folder note counts and quick-create.
- **Connections & backlinks** computed live; accept AI-suggested links, and resolve
  flagged contradictions.
- **Resurface** — contradictions, notes due for spaced review, and the strongest
  unconnected pair worth linking.
- **Ask** — semantic retrieval across your notes (local embeddings) synthesized by a
  local LLM, with cited sources.
- **Graph** — force-directed view of the link graph (node size = inbound links),
  filterable by type, status, tag, and folder; dashed edges show AI semantic
  similarity.
- **Local AI** — everything runs on your device. Embeddings (MiniLM via
  Transformers.js) power semantic suggestions, edges, and Ask; generation (Gemma)
  drives concept/relation analysis and contradiction detection. Pick your backend in
  the **AI panel**: in-browser **WebGPU** (WebLLM) first, with **Ollama** as a local
  fallback — both auto-detected. See [Local AI](#local-ai).
- **Cadence integration** — connect Loam to your local [Cadence](#cadence-integration)
  task manager: see your tasks **grouped by stage** in the sidebar, and **select text
  in any note to turn it into a task** that links back to the note (and is recorded in
  the note's provenance). Works from the UI and over MCP.
- **Provenance, paged** — the inspector shows the last 10 events with a one-click
  **full-history** dialog, fetched on demand so large, long-lived notes stay fast.
- **Command palette** (`⌘K`) — fuzzy search, or create on the spot.
- **Archive & reset** — soft-delete that preserves full history; restore anytime, or
  reset the vault to the starter set from the sidebar footer.

## Stack

- Vite + React 18 + TypeScript
- [Dexie](https://dexie.org/) (IndexedDB) for the local-first store, with
  `dexie-react-hooks` for reactive reads
- [Tiptap](https://tiptap.dev/) (ProseMirror) editor with custom wikilink/tag nodes
- [Transformers.js](https://huggingface.co/docs/transformers.js) (`Xenova/all-MiniLM-L6-v2`)
  for on-device embeddings, in a Web Worker
- [WebLLM](https://github.com/mlc-ai/web-llm) (WebGPU) and [Ollama](https://ollama.com/)
  for local LLM generation (Gemma)
- Zustand for ephemeral UI state
- Geist + JetBrains Mono

## Run

```bash
npm install
npm run dev      # http://localhost:5189
npm run build    # typecheck + production build
npm run typecheck
```

On first launch the vault seeds itself with a small interlinked starter set so the
graph, backlinks, and resurfacing have something to show.

## Local AI

All AI runs **on your machine** — nothing is sent to a cloud API.

- **Embeddings** (semantic suggestions, graph edges, Ask retrieval) use
  `all-MiniLM-L6-v2` via Transformers.js in a Web Worker. They download once and
  cache; notes are embedded in the background.
- **Generation** (concept/relation analysis, contradiction detection, Ask synthesis)
  uses **Gemma**, with two interchangeable backends you choose in the **AI panel**:
  - **In-browser · WebGPU** (WebLLM) — *recommended, default when available*. The
    model downloads to the browser cache; no extra software.
  - **Ollama · local server** — fallback for machines without WebGPU. Install
    [Ollama](https://ollama.com/), then e.g. `ollama pull gemma3:4b`. Loam talks to
    `http://localhost:11434`.

  Both backends are auto-detected; if WebGPU isn't usable, Loam offers Ollama and vice
  versa. No keys, no network calls beyond model downloads.

## Cadence integration

Loam is *not* a task manager — but your notes are where work is conceived, so Loam
connects to [**Cadence**](../cadence), a local energy-aware task manager, to close the
loop between thinking and doing.

**In the app**
- Open **Tasks → ⚙ (Cadence)** in the sidebar, paste a Cadence API token
  (`cdnc_…` — mint one in Cadence under *account menu → API tokens*), and the URL
  (`http://localhost:8088`). The connection persists locally and reconnects on launch.
- Your Cadence tasks appear in the sidebar **grouped by stage** (Backlog · This week ·
  In focus · Done).
- **Select any text in a note → "→ Cadence task"** to create a task from it. The task
  links back to the source note (`loam://note/<id>`), and a `task_created` event is
  written to the note's provenance.

Loam talks to Cadence over its REST API (`/api/v1/*`, Bearer token) — the same API the
Cadence web app uses, scoped to your tenant by the token.

**Over MCP (for AI assistants)**

A `.mcp.json` in this repo registers the [Cadence MCP server](../cadence/mcp) so an
assistant (Claude Code, etc.) can manage your board directly — `whats_next`,
`list_tasks`, `create_task`, `update_task`, `complete_task`, `list_projects`,
`project_status`. To use it:

1. Make sure the Cadence server is running (`cd ~/cadence/server && go run ./cmd/cadence-server`)
   and the MCP is built (`cd ~/cadence/mcp && npm install && npm run build`).
2. Set your token in `.mcp.json` (`CADENCE_API_TOKEN`).
3. Restart Claude Code (or run `/mcp`) so it loads and approves the project server.

> The token in `.mcp.json` is a local secret. This repo isn't under git; if you later
> initialize one, add `.mcp.json` to `.gitignore` (or switch to a `${CADENCE_API_TOKEN}`
> env reference) before committing.

## Architecture

```
src/
  db/            Dexie schema (db.ts), domain types (types.ts), starter seed (seed.ts)
  store/         notes.ts  — all mutations; every write appends a provenance event
                 selectors.ts — backlinks, connections, suggestions, resurfacing, folder tree
                 vault.ts  — reactive hooks over the store
                 ui.ts     — view/selection/inspector state
  lib/           id/zid, time, doc (Tiptap JSON ↔ text/markdown/links), bus
  ai/            config (models/thresholds), llm (WebLLM + Ollama), vectors,
                 embeddings.worker / llm.worker, store (backends, analysis, Ask)
  cadence/       config (stages), client (REST), store (connection + tasks)
  components/    Sidebar, NoteView, Inspector, CommandPalette, AiPanel, CadencePanel,
                 CadenceTasks, icons
    editor/      Tiptap editor, wikilink/tag extensions, suggestion popup,
                 selection → Cadence task bubble menu
    views/       Resurface, Ask, Graph, Archive
  styles/        tokens.css (design tokens), global.css
```

The **store is the single source of truth for mutations**: UI never writes to Dexie
directly, it calls `store/notes.ts`, which keeps links/tags/text in sync and records
provenance.

## Roadmap

- Optional vault-on-disk sync via the File System Access API (notes as `.md` +
  YAML frontmatter)
- Drag-to-reorder / drag-to-move in the folder tree
- Graph focus mode and time-scrubbing of how the graph grew
- Two-way Cadence sync (reflect task completion back onto linked notes)
