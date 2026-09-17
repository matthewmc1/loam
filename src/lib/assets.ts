/**
 * The vault's image store.
 *
 *   ingest   File/Blob → (downscale) → hash → `assets` row     → asset id
 *   display  asset id  → cached object URL (blob:)             → <img src>
 *   sweep    assets nothing points at any more are deleted, a day late — so
 *            undoing an image removal never finds its picture gone
 *
 * Bytes are stored once, outside the note: a doc holds `{ assetId }`, never a
 * data URL. That keeps notes small, keeps base64 out of search and the AI
 * surface, and lets the same picture be shared by many notes.
 */
import { db } from "../db/db";
import type { Asset, Note } from "../db/types";
import { uid } from "./id";
import { walk, type PMNode } from "./doc";

/** Longest edge we keep. A 12 MP phone photo becomes ~400 KB instead of ~5 MB. */
export const MAX_EDGE = 2400;
/** Refuse anything bigger than this before even decoding it. */
export const MAX_BYTES = 25 * 1024 * 1024;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml"]);
/** Formats we never re-encode: animation and vectors don't survive a canvas. */
const KEEP_AS_IS = new Set(["image/gif", "image/svg+xml"]);

export function isImageFile(f: { type: string }): boolean {
  return ACCEPTED.has(f.type);
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Target size for a w×h image under the edge cap (never upscales). */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

interface Prepared {
  data: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
}

/** Decode, and downscale + re-encode only when that actually saves space. */
async function prepare(file: Blob): Promise<Prepared> {
  const original = await file.arrayBuffer();
  if (KEEP_AS_IS.has(file.type)) {
    const dims = await measure(file).catch(() => ({ width: 0, height: 0 }));
    return { data: original, mime: file.type, ...dims };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width === bitmap.width && file.size < 1.5 * 1024 * 1024)
      return { data: original, mime: file.type, width, height };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    // webp keeps alpha and beats jpeg at the same quality; every current browser encodes it
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
    if (!blob || blob.size >= file.size) return { data: original, mime: file.type, width: bitmap.width, height: bitmap.height };
    return { data: await blob.arrayBuffer(), mime: blob.type, width, height };
  } finally {
    bitmap.close();
  }
}

function measure(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), res({ width: img.naturalWidth, height: img.naturalHeight }));
    img.onerror = () => (URL.revokeObjectURL(url), rej(new Error("unreadable image")));
    img.src = url;
  });
}

export class AssetError extends Error {}

/** Store an image, returning its asset (an existing one, if these exact bytes are already here). */
export async function ingestImage(file: File | Blob): Promise<Asset> {
  if (!isImageFile(file)) throw new AssetError("That file isn’t an image Loam can show.");
  if (file.size > MAX_BYTES) throw new AssetError("That image is over 25 MB — too large to keep in the vault.");
  let prepared: Prepared;
  try {
    prepared = await prepare(file);
  } catch {
    throw new AssetError("That image couldn’t be read.");
  }
  return putAsset({ ...prepared, name: file instanceof File ? file.name : "" });
}

/** Insert-or-reuse by content hash. Split out so it's testable without a canvas. */
export async function putAsset(input: Prepared & { name: string }): Promise<Asset> {
  const hash = await sha256(input.data);
  const existing = await db.assets.where("hash").equals(hash).first();
  if (existing) return existing;
  const asset: Asset = {
    id: uid("img"),
    hash,
    mime: input.mime,
    name: input.name,
    data: input.data,
    width: input.width,
    height: input.height,
    size: input.data.byteLength,
    createdAt: Date.now(),
  };
  try {
    await db.assets.add(asset);
  } catch (e) {
    if ((e as Error)?.name === "QuotaExceededError")
      throw new AssetError("This browser’s storage is full — export the vault, then free some space.");
    throw e;
  }
  return asset;
}

/* ------------------------------ display --------------------------------- */

const urls = new Map<string, Promise<string | null>>();

/** A blob: URL for an asset — created once per session and shared by every <img> using it. */
export function assetUrl(id: string): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = db.assets.get(id).then((a) => (a ? URL.createObjectURL(new Blob([a.data], { type: a.mime })) : null));
    urls.set(id, p);
    // a miss isn't cached: the asset may arrive a moment later (restore, another tab)
    void p.then((u) => u == null && urls.delete(id));
  }
  return p;
}

function forget(id: string) {
  const p = urls.get(id);
  urls.delete(id);
  void p?.then((u) => u && URL.revokeObjectURL(u));
}

/* ------------------------------- cleanup -------------------------------- */

/** Every asset id a note points at: inline images in the doc, plus its hero. */
export function assetIdsOf(note: Pick<Note, "doc" | "heroAssetId">): string[] {
  const ids = new Set<string>();
  if (note.heroAssetId) ids.add(note.heroAssetId);
  walk(note.doc as PMNode, (n) => {
    if (n.type === "image" && typeof n.attrs?.assetId === "string") ids.add(n.attrs.assetId);
  });
  return [...ids];
}

/**
 * Delete assets no note references. Archived notes still count (they can be
 * restored); recent orphans are spared so undo/redo can bring an image back.
 */
export async function sweepAssets(now = Date.now(), grace = ORPHAN_GRACE_MS): Promise<number> {
  const used = new Set<string>();
  await db.notes.each((n) => assetIdsOf(n).forEach((id) => used.add(id)));
  const doomed = (await db.assets.toCollection().primaryKeys()).filter((id) => !used.has(id));
  let removed = 0;
  for (const id of doomed) {
    const a = await db.assets.get(id);
    if (!a || now - a.createdAt < grace) continue;
    await db.assets.delete(id);
    forget(id);
    removed++;
  }
  return removed;
}

/** Total bytes of stored images — for the "how big is my vault" readout. */
export async function assetBytes(): Promise<number> {
  let total = 0;
  await db.assets.each((a) => (total += a.size));
  return total;
}

/* ------------------------------- backup --------------------------------- */

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  // chunked: String.fromCharCode(...hugeArray) overflows the call stack
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};
