import type { Note } from "../db/types";

/** Cosine similarity. Embeddings are normalized, so this is just the dot product. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/** Stable, cheap hash of a note's embeddable text (to detect staleness). */
export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + s.length;
}

/** The text we embed for a note: title, tags, and body. */
export function embedText(note: Pick<Note, "title" | "tags" | "text">): string {
  return [note.title, note.tags.map((t) => "#" + t).join(" "), note.text]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

export interface Neighbor {
  note: Note;
  score: number;
}

/** Rank candidate notes by similarity to `id`, descending. */
export function topNeighbors(
  vectors: Map<string, number[]>,
  id: string,
  candidates: Note[],
  k: number,
  minScore = 0
): Neighbor[] {
  const self = vectors.get(id);
  if (!self) return [];
  const scored: Neighbor[] = [];
  for (const n of candidates) {
    if (n.id === id || n.archivedAt) continue;
    const v = vectors.get(n.id);
    if (!v) continue;
    const score = cosine(self, v);
    if (score >= minScore) scored.push({ note: n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
