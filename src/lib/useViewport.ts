import { useSyncExternalStore } from "react";

/**
 * Loam's three layouts:
 *   wide    ≥ 1100px  sidebar · note · inspector, side by side
 *   medium  ≥ 760px   sidebar · note; the inspector slides over as a drawer
 *   narrow  < 760px   the note alone; sidebar and inspector are both drawers
 *
 * The same breakpoints are mirrored in global.css — change them together.
 */
export type Viewport = "wide" | "medium" | "narrow";

const WIDE = "(min-width: 1100px)";
const MEDIUM = "(min-width: 760px)";

function read(): Viewport {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  return window.matchMedia(WIDE).matches ? "wide" : window.matchMedia(MEDIUM).matches ? "medium" : "narrow";
}

function subscribe(cb: () => void): () => void {
  const lists = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
  lists.forEach((l) => l.addEventListener("change", cb));
  return () => lists.forEach((l) => l.removeEventListener("change", cb));
}

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, read, () => "wide" as const);
}
