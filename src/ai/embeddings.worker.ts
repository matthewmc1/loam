/// <reference lib="webworker" />
/**
 * Embeddings worker — runs Transformers.js feature-extraction off the main
 * thread. Loaded only when the user enables local AI.
 */
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBED_MODEL } from "./config";

// browser-only; never hit the local filesystem
env.allowLocalModels = false;

let pipe: Promise<FeatureExtractionPipeline> | null = null;

function getPipe(): Promise<FeatureExtractionPipeline> {
  if (!pipe) {
    pipe = pipeline("feature-extraction", EMBED_MODEL, {
      progress_callback: (p: unknown) => self.postMessage({ type: "progress", p }),
    }) as Promise<FeatureExtractionPipeline>;
  }
  return pipe;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, texts } = e.data as { id: number; type: string; texts: string[] };
  if (type !== "embed") return;
  try {
    const extractor = await getPipe();
    const out = await extractor(texts, { pooling: "mean", normalize: true });
    const vectors = out.tolist() as number[][];
    self.postMessage({ type: "result", id, vectors });
  } catch (err) {
    self.postMessage({ type: "error", id, message: String((err as Error)?.message ?? err) });
  }
};
