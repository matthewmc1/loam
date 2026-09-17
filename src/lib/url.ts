/**
 * External URLs — links out of the vault to sources and other material.
 * Everything that becomes an href passes through `normalizeUrl`, so a note
 * (or an imported backup) can never smuggle in a `javascript:` link.
 */

const SAFE = new Set(["http:", "https:", "mailto:"]);

/**
 * Clean up what a person typed or pasted into a URL. Bare domains get https://;
 * anything that isn't a web or mail address returns null.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!SAFE.has(url.protocol)) return null;
  if (url.protocol === "mailto:") return url.pathname.includes("@") ? url.href : null;
  // "https://foo" parses, but a host with no dot is a typo, not a link
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  return url.href;
}

/** True when a free-text field (e.g. a note's `source`) holds just a URL. */
export function isUrl(value: string): boolean {
  return /^(https?:\/\/|www\.)\S+$/i.test(value.trim()) && normalizeUrl(value) != null;
}

/** "example.com" — the part of a URL a reader recognises. */
export function urlHost(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "mailto:" ? u.pathname : u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Fallback title for a reference nobody has named: host plus a short path. */
export function urlLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "mailto:") return u.pathname;
    const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
    const tail = path.length > 28 ? "/…" + path.slice(-24) : path;
    return urlHost(url) + tail;
  } catch {
    return url;
  }
}

/** Same page, for dedupe: ignores the fragment, a trailing slash and www. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "") + u.search).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
