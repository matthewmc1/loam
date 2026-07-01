/** Local-AI configuration. Everything here runs on-device. */

/** In-browser embedding model (Transformers.js, ~25MB, 384-dim). */
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;

/**
 * Selectable generation models. There is no "Gemma 4" — the small Gemmas are
 * Gemma 2 (2B/9B), Gemma 3 (1B/4B/12B), and Gemma 3n (E2B/E4B).
 *
 * Two ways to run them locally:
 *  - **webllm**: fully in-browser on your GPU via WebGPU. Zero install. (primary)
 *  - **ollama**: a local Ollama server — runs any size, incl. Gemma 3 4B. (fallback)
 */
export interface LlmModelOption {
  backend: "ollama" | "webllm";
  /** model id passed to the backend */
  model: string;
  label: string;
  note: string;
  /** approx download size, for the UI */
  size: string;
}

export const LLM_MODELS: LlmModelOption[] = [
  // In-browser (WebGPU) — primary, no install
  { backend: "webllm", model: "gemma-2-2b-it-q4f16_1-MLC-1k", label: "Gemma 2 · 2B", note: "balanced", size: "~1.4 GB" },
  { backend: "webllm", model: "gemma3-1b-it-q4f16_1-MLC", label: "Gemma 3 · 1B", note: "fastest", size: "~0.9 GB" },
  // Ollama — local server, larger / newer models
  { backend: "ollama", model: "gemma3:4b", label: "Gemma 3 · 4B", note: "most capable", size: "3.3 GB" },
  { backend: "ollama", model: "gemma3n:e2b", label: "Gemma 3n · E2B", note: "on-device tuned", size: "2.0 GB" },
  { backend: "ollama", model: "gemma3:1b", label: "Gemma 3 · 1B", note: "fastest", size: "0.8 GB" },
  { backend: "ollama", model: "gemma2:2b", label: "Gemma 2 · 2B", note: "prior gen", size: "1.6 GB" },
];

export const WEBLLM_MODELS = LLM_MODELS.filter((m) => m.backend === "webllm");
export const OLLAMA_MODELS = LLM_MODELS.filter((m) => m.backend === "ollama");

/** Primary path = in-browser WebGPU; fallback = Ollama for bigger models. */
export const WEBLLM_DEFAULT = WEBLLM_MODELS[0];
export const OLLAMA_DEFAULT = OLLAMA_MODELS[0];

export const OLLAMA_URL = "http://localhost:11434";

/** Similarity thresholds (cosine over normalized embeddings). */
export const SUGGEST_THRESHOLD = 0.35; // min similarity to suggest a link
export const EDGE_THRESHOLD = 0.46; // min similarity to draw a graph edge
export const TOP_K = 6; // neighbors considered for link suggestions
export const ASK_TOP_K = 4; // sources retrieved for an Ask answer
