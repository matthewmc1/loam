/** Stable unique id for notes, folders, events. */
export function uid(prefix = "n"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}_${t}${rand}`;
}

/**
 * Zettelkasten id: a timestamp down to the minute, e.g. 202606281521.
 * Human-meaningful and chronologically sortable.
 */
export function zid(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}` +
    `${p(d.getMonth() + 1)}` +
    `${p(d.getDate())}` +
    `${p(d.getHours())}` +
    `${p(d.getMinutes())}`
  );
}
