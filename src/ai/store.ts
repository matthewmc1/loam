import { create } from "zustand";
import { db } from "../db/db";
import type { AiRelation, Note } from "../db/types";
import { logEvent } from "../store/notes";
import { uid } from "../lib/id";
import { embedder } from "./embeddings";
import {
  loadLlm,
  chat,
  chatJSON,
  parseJSON,
  webgpuAvailable,
  webgpuUsable,
  ollamaAvailable,
  ollamaList,
} from "./llm";
import { embedText, hashText, topNeighbors } from "./vectors";
import {
  EMBED_MODEL,
  WEBLLM_DEFAULT,
  OLLAMA_DEFAULT,
  LLM_MODELS,
  type LlmModelOption,
} from "./config";

type LoadState = "off" | "loading" | "ready" | "error";
type OllamaStatus = "unknown" | "checking" | "up" | "down";

const RELATION_TYPES: AiRelation["type"][] = [
  "supports",
  "contradicts",
  "extends",
  "refines",
  "related",
];

interface AnalyzeResult {
  concepts?: string[];
  relations?: { target?: string; type?: string; rationale?: string }[];
}

interface AiState {
  embed: LoadState;
  embedMsg: string;
  llm: LoadState;
  llmMsg: string;
  llmProgress: number; // 0..1 download/init progress
  model: LlmModelOption;
  vectors: Map<string, number[]>;
  analyzing: Set<string>;
  scanning: boolean;
  scanMsg: string;
  panelOpen: boolean;

  // capability detection
  webgpu: boolean;
  ollamaStatus: OllamaStatus;
  ollamaModels: string[];

  setPanel(open: boolean): void;
  selectModel(opt: LlmModelOption): void;
  probeBackends(): Promise<void>;
  loadVectors(): Promise<void>;
  enableEmbeddings(): Promise<void>;
  embedNote(note: Note): Promise<void>;
  enableLlm(): Promise<void>;
  analyzeNote(id: string): Promise<void>;
  scanContradictions(): Promise<void>;
}

/** Saved preference, else the best available default (WebGPU first). */
function savedModel(): LlmModelOption {
  try {
    const raw = localStorage.getItem("loam-ai-model");
    if (raw) {
      const found = LLM_MODELS.find((m) => m.backend + m.model === raw);
      if (found) return found;
    }
  } catch {
    /* ignore */
  }
  return webgpuAvailable() ? WEBLLM_DEFAULT : OLLAMA_DEFAULT;
}

export const useAi = create<AiState>((set, get) => ({
  embed: "off",
  embedMsg: "",
  llm: "off",
  llmMsg: "",
  llmProgress: 0,
  model: savedModel(),
  vectors: new Map(),
  analyzing: new Set(),
  scanning: false,
  scanMsg: "",
  panelOpen: false,

  webgpu: webgpuAvailable(),
  ollamaStatus: "unknown",
  ollamaModels: [],

  setPanel: (open) => {
    set({ panelOpen: open });
    if (open && get().ollamaStatus === "unknown") void get().probeBackends();
  },

  selectModel: (opt) => {
    try {
      localStorage.setItem("loam-ai-model", opt.backend + opt.model);
    } catch {
      /* ignore */
    }
    set({ model: opt, llm: "off", llmMsg: "", llmProgress: 0 });
  },

  probeBackends: async () => {
    set({ ollamaStatus: "checking" });
    void webgpuUsable().then((ok) => set({ webgpu: ok }));
    const up = await ollamaAvailable();
    if (!up) {
      set({ ollamaStatus: "down", ollamaModels: [] });
      return;
    }
    set({ ollamaStatus: "up", ollamaModels: await ollamaList() });
  },

  loadVectors: async () => {
    const rows = await db.vectors.where("model").equals(EMBED_MODEL).toArray();
    const m = new Map<string, number[]>();
    for (const r of rows) m.set(r.id, r.vec);
    set({ vectors: m });
    if (rows.length > 0 && get().embed === "off")
      set({ embed: "ready", embedMsg: `${rows.length} notes embedded (cached)` });
    // auto-resume the embedding model if the user had enabled it
    try {
      if (localStorage.getItem("loam-ai-embed") === "on") void get().enableEmbeddings();
    } catch {
      /* ignore */
    }
  },

  enableEmbeddings: async () => {
    if (get().embed === "loading") return;
    set({ embed: "loading", embedMsg: "Loading embedding model…" });
    embedder.onProgress = (p) => {
      const e = p as { status?: string; file?: string; progress?: number };
      if (e?.status === "progress" && e.file)
        set({ embedMsg: `Downloading ${e.file} ${Math.round(e.progress ?? 0)}%` });
    };
    try {
      const all = await db.notes.toArray();
      const live = all.filter((n) => !n.archivedAt);
      const existing = await db.vectors.toArray();
      const vmap = new Map(existing.map((v) => [v.id, v]));
      const mem = new Map(get().vectors);
      for (const v of existing) if (v.model === EMBED_MODEL) mem.set(v.id, v.vec);

      const stale = live.filter((n) => {
        const v = vmap.get(n.id);
        return !v || v.model !== EMBED_MODEL || v.hash !== hashText(embedText(n));
      });

      if (stale.length === 0) {
        set({ embed: "ready", embedMsg: `Ready · ${mem.size} notes embedded`, vectors: mem });
      } else {
        const CHUNK = 16;
        for (let i = 0; i < stale.length; i += CHUNK) {
          const batch = stale.slice(i, i + CHUNK);
          const vecs = await embedder.embed(batch.map(embedText));
          const now = Date.now();
          const rows = batch.map((n, j) => ({
            id: n.id,
            model: EMBED_MODEL,
            dim: vecs[j].length,
            hash: hashText(embedText(n)),
            vec: vecs[j],
            updatedAt: now,
          }));
          await db.vectors.bulkPut(rows);
          for (const r of rows) mem.set(r.id, r.vec);
          set({
            vectors: new Map(mem),
            embedMsg: `Embedding ${Math.min(i + CHUNK, stale.length)}/${stale.length}…`,
          });
        }
        set({ embed: "ready", embedMsg: `Ready · ${mem.size} notes embedded` });
      }
      localStorage.setItem("loam-ai-embed", "on");
    } catch (e) {
      set({ embed: "error", embedMsg: (e as Error).message });
    }
  },

  embedNote: async (note) => {
    if (get().embed !== "ready" || note.archivedAt) return;
    try {
      const [vec] = await embedder.embed([embedText(note)]);
      if (!vec) return;
      await db.vectors.put({
        id: note.id,
        model: EMBED_MODEL,
        dim: vec.length,
        hash: hashText(embedText(note)),
        vec,
        updatedAt: Date.now(),
      });
      const mem = new Map(get().vectors);
      mem.set(note.id, vec);
      set({ vectors: mem });
    } catch {
      /* keep prior vector */
    }
  },

  enableLlm: async () => {
    if (get().llm === "loading") return; // no concurrent heavy loads
    const opt = get().model;
    const backend = opt.backend === "webllm" ? "in-browser" : "Ollama";
    set({ llm: "loading", llmProgress: 0, llmMsg: `Loading ${opt.label} (${backend})…` });
    try {
      await loadLlm(opt, (text, ratio) =>
        set({
          llmProgress: ratio ?? 0,
          llmMsg: ratio ? `${text} ${Math.round(ratio * 100)}%` : text,
        })
      );
      set({ llm: "ready", llmProgress: 1, llmMsg: `${opt.label} ready · ${backend}` });
    } catch (e) {
      set({ llm: "error", llmProgress: 0, llmMsg: (e as Error).message });
    }
  },

  analyzeNote: async (id) => {
    if (get().llm !== "ready") return;
    const note = await db.notes.get(id);
    if (!note) return;
    set((s) => ({ analyzing: new Set(s.analyzing).add(id) }));
    try {
      const all = (await db.notes.toArray()).filter((n) => !n.archivedAt);
      const neighbors = topNeighbors(get().vectors, id, all, 8, 0).map((n) => n.note);
      const byTitle = new Map(all.map((n) => [n.title.toLowerCase(), n.id]));

      const system =
        "You extract structured knowledge from one note in a Zettelkasten. " +
        "Reply with ONLY a JSON object, no prose.";
      const user =
        `NOTE: ${note.title}\n\n${note.text}\n\n` +
        `RELATED NOTES (relate only to these titles):\n` +
        neighbors.map((n) => `- ${n.title}`).join("\n") +
        `\n\nReturn JSON: {"concepts": string[] (3-6 atomic key concepts), ` +
        `"relations": [{"target": string (exact related-note title), ` +
        `"type": "supports"|"contradicts"|"extends"|"refines"|"related", ` +
        `"rationale": string (max 14 words)}]}`;

      // parse explicitly so a transient parse failure doesn't wipe prior analysis
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        true
      );
      const result = parseJSON<AnalyzeResult | null>(raw, null);
      if (!result) {
        await logEvent(id, "analyzed", "analysis failed: model returned unparseable output");
        return;
      }
      const concepts = (result.concepts ?? []).map(String).slice(0, 8);
      const relations: AiRelation[] = (result.relations ?? [])
        .map((r) => {
          const target = String(r.target ?? "");
          const type = (RELATION_TYPES as string[]).includes(String(r.type))
            ? (r.type as AiRelation["type"])
            : "related";
          return {
            targetId: byTitle.get(target.toLowerCase()) ?? null,
            target,
            type,
            rationale: String(r.rationale ?? ""),
          };
        })
        .filter((r) => r.targetId && r.targetId !== id);

      await db.notes.update(id, {
        aiConcepts: concepts,
        aiRelations: relations,
        aiAnalyzedAt: Date.now(),
      });
      await logEvent(id, "analyzed", `analyzed · ${concepts.length} concepts, ${relations.length} relations`);

      // surface model-found contradictions through the existing provenance path
      for (const r of relations) {
        if (r.type === "contradicts" && r.targetId)
          await flagContradiction(id, r.targetId, `${r.rationale}`);
      }
    } catch (e) {
      await logEvent(id, "analyzed", `analysis failed: ${(e as Error).message}`);
    } finally {
      set((s) => {
        const n = new Set(s.analyzing);
        n.delete(id);
        return { analyzing: n };
      });
    }
  },

  scanContradictions: async () => {
    if (get().llm !== "ready" || get().scanning) return;
    set({ scanning: true, scanMsg: "Finding candidate pairs…" });
    try {
      const all = (await db.notes.toArray()).filter((n) => !n.archivedAt);
      const vectors = get().vectors;
      // collect the most-similar unique pairs to test (capped — generation is slow)
      const seen = new Set<string>();
      const pairs: { a: Note; b: Note; score: number }[] = [];
      for (const n of all) {
        const top = topNeighbors(vectors, n.id, all, 1, 0.5)[0];
        if (!top) continue;
        const key = [n.id, top.note.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a: n, b: top.note, score: top.score });
      }
      pairs.sort((x, y) => y.score - x.score);
      const work = pairs.slice(0, 12);

      let found = 0;
      for (let i = 0; i < work.length; i++) {
        const { a, b } = work[i];
        set({ scanMsg: `Checking ${i + 1}/${work.length}…` });
        const res = await chatJSON<{ contradicts?: boolean; why?: string }>(
          "You judge whether two notes make conflicting factual claims. Reply ONLY with JSON.",
          `NOTE A (${a.title}):\n${a.text}\n\nNOTE B (${b.title}):\n${b.text}\n\n` +
            `Return JSON: {"contradicts": boolean, "why": string (max 18 words)}`,
          {}
        );
        if (res.contradicts) {
          await flagContradiction(a.id, b.id, res.why ?? "Conflicting claims detected.");
          found++;
        }
      }
      set({ scanning: false, scanMsg: `Done · ${found} contradiction${found === 1 ? "" : "s"} flagged` });
    } catch (e) {
      set({ scanning: false, scanMsg: (e as Error).message });
    }
  },
}));

/** Flag a contradiction once (no duplicates for the same pair). */
async function flagContradiction(id: string, relatedId: string, message: string): Promise<void> {
  const events = await db.events.where("noteId").equals(id).toArray();
  const already = events.some(
    (e) => e.kind === "contradiction_flagged" && e.relatedNoteId === relatedId
  );
  if (already) return;
  const target = await db.notes.get(relatedId);
  await logEvent(id, "contradiction_flagged", `possible conflict with “${target?.title ?? relatedId}”`, {
    relatedNoteId: relatedId,
    data: { message, source: "ai", eventId: uid("c") },
  });
}

export { webgpuAvailable, ollamaAvailable };
