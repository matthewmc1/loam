/** Main-thread client for the embeddings worker. */

type Pending = { resolve: (v: number[][]) => void; reject: (e: Error) => void };

class Embedder {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private seq = 0;
  onProgress: ((p: unknown) => void) | null = null;

  private ensure() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./embeddings.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === "progress") this.onProgress?.(d.p);
      else if (d.type === "result") {
        this.pending.get(d.id)?.resolve(d.vectors);
        this.pending.delete(d.id);
      } else if (d.type === "error") {
        this.pending.get(d.id)?.reject(new Error(d.message));
        this.pending.delete(d.id);
      }
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || "worker error"));
      this.pending.clear();
    };
  }

  embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return Promise.resolve([]);
    this.ensure();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: "embed", id, texts });
    });
  }
}

export const embedder = new Embedder();
