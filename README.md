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
  review interval, verified/reviewed dates, aliases, the Zettelkasten id, and
  arbitrary custom properties. Every edit is logged to provenance.
- **Folders** — nestable, colored, user-created — for organizing the vault, with
  per-folder note counts and quick-create.
- **Connections & backlinks** computed live — and **typed**: links can carry a
  relation (*supports / contradicts / extends / refines*) and a one-line rationale,
  so future-you knows *why* two notes connect, not just that they do. Accepting an
  AI-proposed relation persists its type and rationale into the link graph.
- **Unlinked mentions** — Loam scans prose for other notes' titles and aliases
  typed *without* `[[brackets]]`, in both directions, and offers one-click linking.
  Old notes keep discovering new ones as the vault grows.
- **A real review loop** — notes carry a review interval (7/30/90/180d); **Mark
  reviewed** resets the clock and doubles the interval (capped at 180d), so settled
  knowledge asks for attention less and less. Snooze pushes a reminder out a week.
  Reviewing is distinct from verifying.
- **Resurface** — contradictions, notes due for review (mature notes first), the
  strongest unconnected pair (semantic when embeddings exist, with an honest
  explanation of the evidence), plus **vault health**: fleeting notes that earned
  promotion to Permanent, dead weight worth archiving, and tag clusters missing a
  Map of Content. Dismissals persist.
- **Ask** — semantic retrieval across your notes (local embeddings) synthesized by a
  local LLM, with cited sources.
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
- **Works offline** — Loam installs as a PWA: the whole app shell (and fonts) are
  cached by a service worker, so it opens on a plane even when hosted remotely.
  Cadence tasks created or completed while the server is unreachable **queue in a
  local outbox and sync automatically** the moment it answers again.
- **Backup you own** — one-click **export of the entire vault** (notes, folders,
  links, full provenance) to a JSON file, and import to restore it anywhere.
  Persistent-storage protection is requested from the browser on first launch.

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

## Quick start

```bash
git clone https://github.com/matthewmc1/loam.git && cd loam
./start.sh
```

One command: installs dependencies, starts [Cadence](#cadence-integration) if it's
on your machine (and mints you an API token when it does — Cadence's dev backend is
in-memory, so tokens don't survive its restarts), then opens Loam at
**http://localhost:5189**. Loam runs fine without Cadence — the integration just
stays dormant until you connect it.

```bash
./start.sh --no-cadence   # just Loam
./start.sh --preview      # production build at :4173 — visit once, then try it offline
./start.sh --token        # re-mint a Cadence dev token (e.g. after restarting Cadence)
./start.sh --check        # verify the setup without launching anything
```

Useful env vars: `CADENCE_DIR` (default `~/cadence`), `CADENCE_URL` (default
`http://localhost:8088`), `LOAM_EMAIL` (identity for the dev token — defaults to
your git email).

Manual equivalent:

```bash
npm install
npm run dev      # http://localhost:5189
npm run build    # typecheck + production build (PWA)
npm run typecheck
npm test         # data-layer tests (Vitest + fake-indexeddb)
npm run check    # everything CI runs: typecheck, tests, production build
```

On first launch the vault seeds itself with a small interlinked starter set so
backlinks, connections, and resurfacing have something to show.

## Local AI

All AI runs **on your machine** — nothing is sent to a cloud API.

- **Embeddings** (semantic suggestions, Ask retrieval) use
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
  In focus · Done). Tasks born from a note show a **↗ source-note chip** — one click
  jumps to the thinking that spawned the work.
- **Select any text in a note → "→ Cadence task"** to create a task from it. The task
  links back to the source note (`loam://note/<id>`), and a `task_created` event is
  written to the note's provenance.
- Every note shows a **"Tasks from this note"** section with live stage status, and
  tasks are **completable right there** — completion updates Cadence and writes a
  `task_completed` event to the note's provenance, closing the thinking → doing loop.

Loam talks to Cadence over its REST API (`/api/v1/*`, Bearer token) — the same API the
Cadence web app uses, scoped to your tenant by the token.

**Offline** — reachability is probed by trying, never by `navigator.onLine` (which
lies on planes, where a localhost Cadence works fine). If the server doesn't answer,
Loam flips to an *offline* state: task creates and completions queue in an IndexedDB
outbox, render immediately with a `queued ↺` marker, survive reloads, and flush in
order the moment Cadence is reachable — via the OS online event, a background retry
loop, or a manual retry.

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

## Offline, persistence & security

- **App shell**: `vite-plugin-pwa` precaches the build (JS/CSS/HTML/icons) and
  runtime-caches Google Fonts and the ONNX wasm, so a previously-visited Loam loads
  with zero network — including when it's hosted on a remote origin.
- **Data**: everything lives in IndexedDB on-device. `navigator.storage.persist()`
  is requested at boot to shield the vault from storage-pressure eviction (the
  footer tooltip shows whether the browser granted it). Export/import gives you a
  file-based backup that survives profile resets and machine moves.
- **Security**: a CSP locks scripts to the app's own origin (plus wasm for the
  local AI runtimes) and blocks plugins/base hijacking. The Cadence token stays in
  `localStorage`, is never exported in backups, and no note content leaves the
  device — AI included.

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
    views/       Resurface, Ask, Archive
  styles/        tokens.css (design tokens), global.css
```

The **store is the single source of truth for mutations**: UI never writes to Dexie
directly, it calls `store/notes.ts`, which keeps links/tags/text in sync and records
provenance.

## Roadmap

- Optional vault-on-disk sync via the File System Access API (notes as `.md` +
  YAML frontmatter)
- Drag-to-reorder / drag-to-move in the folder tree
- Bring the graph back *embedded* — a local neighbourhood map inside the note
  inspector rather than a standalone view (the full-page graph was removed)
- Push Cadence-side completions into note provenance live (WebSocket), not just
  when completed from Loam
