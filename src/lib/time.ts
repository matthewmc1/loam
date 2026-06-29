/** Compact relative time, e.g. "6h ago", "3d ago", "just now". */
export function relativeTime(ts: number | null, now = Date.now()): string {
  if (ts == null) return "—";
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(mon / 12)}y ago`;
}

/** Short, bare duration without "ago" — used in the provenance gutter. */
export function shortAge(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const day = Math.floor(diff / 86400000);
  if (day < 1) {
    const hr = Math.floor(diff / 3600000);
    return hr < 1 ? "now" : `${hr}h`;
  }
  return `${day}d`;
}

/** "Mar 4" style absolute date for created/verified fields. */
export function shortDate(ts: number | null): string {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Number of whole days since a timestamp. */
export function daysSince(ts: number | null, now = Date.now()): number {
  if (ts == null) return Infinity;
  return Math.floor((now - ts) / 86400000);
}

/** Parse a review cadence like "every 30d" into days, or null. */
export function cadenceDays(cadence: string): number | null {
  const m = /(\d+)\s*d/.exec(cadence);
  return m ? Number(m[1]) : null;
}
