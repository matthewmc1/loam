import { useMemo, useState } from "react";
import type { Vault } from "../../store/vault";
import { useUI } from "../../store/ui";
import { useAi } from "../../ai/store";
import { liveNotes, outboundIds } from "../../store/selectors";
import { cosine } from "../../ai/vectors";
import { EDGE_THRESHOLD } from "../../ai/config";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  NOTE_TYPES,
  NOTE_STATUSES,
  type Note,
  type NoteType,
  type NoteStatus,
} from "../../db/types";

const W = 820;
const H = 560;
const MAX_NODES = 80;

export function GraphView({ vault }: { vault: Vault }) {
  const { open } = useUI();
  const vectors = useAi((s) => s.vectors);
  // dexie returns a stable array until db.notes changes — memoize so the heavy
  // force-directed layout below doesn't recompute on every unrelated render
  const all = useMemo(() => liveNotes(vault.notes), [vault.notes]);

  // metadata filters — empty set / null = "all"
  const [fType, setFType] = useState<Set<NoteType>>(new Set());
  const [fStatus, setFStatus] = useState<Set<NoteStatus>>(new Set());
  const [fTag, setFTag] = useState<string>("");
  const [fFolder, setFFolder] = useState<string>("");

  const allTags = useMemo(
    () => Array.from(new Set(all.flatMap((n) => n.tags))).sort(),
    [all]
  );

  const filtered = useMemo(
    () =>
      all.filter(
        (n) =>
          (fType.size === 0 || fType.has(n.type)) &&
          (fStatus.size === 0 || fStatus.has(n.status)) &&
          (!fTag || n.tags.includes(fTag)) &&
          (!fFolder || (fFolder === "__unfiled" ? !n.folderId : n.folderId === fFolder))
      ),
    [all, fType, fStatus, fTag, fFolder]
  );

  const shown = useMemo(() => filtered.slice(0, MAX_NODES), [filtered]);
  const { nodes, edges, simCount } = useMemo(() => layout(shown, vectors), [shown, vectors]);

  const active = fType.size > 0 || fStatus.size > 0 || !!fTag || !!fFolder;
  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  };
  const clearAll = () => {
    setFType(new Set());
    setFStatus(new Set());
    setFTag("");
    setFFolder("");
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={page}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>Graph</h1>
          <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>
            <Legend color="var(--status-verified)" label="verified" />
            <Legend color="var(--status-review)" label="review" />
            <Legend color="var(--status-fleeting)" label="fleeting" />
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Node size = inbound links. Solid = explicit&nbsp;
          <span style={{ color: "var(--text-fainter)" }}>[[links]]</span>
          {simCount > 0 ? (
            <>; dashed = semantic similarity from local AI ({simCount}).</>
          ) : (
            <> . Enable embeddings in the AI panel to reveal semantic edges.</>
          )}{" "}
          Click to open.
        </p>

        {/* metadata filters */}
        <div style={filterBar}>
          <FilterGroup label="Status">
            {NOTE_STATUSES.map((st) => (
              <Chip key={st} active={fStatus.has(st)} dot={STATUS_COLOR[st]} onClick={() => setFStatus((s) => toggle(s, st))}>
                {STATUS_LABEL[st]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Type">
            {NOTE_TYPES.map((t) => (
              <Chip key={t} active={fType.has(t)} onClick={() => setFType((s) => toggle(s, t))}>
                {t}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Tag">
            <select style={select} value={fTag} onChange={(e) => setFTag(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup label="Folder">
            <select style={select} value={fFolder} onChange={(e) => setFFolder(e.target.value)}>
              <option value="">All folders</option>
              {vault.folders.filter((f) => !f.archivedAt).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="__unfiled">Unfiled</option>
            </select>
          </FilterGroup>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-fainter)" }}>
              {active ? `${filtered.length} of ${all.length}` : `${all.length}`} notes
              {filtered.length > MAX_NODES ? ` · showing ${MAX_NODES}` : ""}
            </span>
            {active && (
              <button style={clearBtn} onClick={clearAll}>
                Clear
              </button>
            )}
          </span>
        </div>

        {nodes.length === 0 ? (
          <div style={emptyState}>{active ? "No notes match these filters." : "No notes yet."}</div>
        ) : (
        <div style={canvas}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, maxWidth: "100%" }}>
            {edges.map((e, i) =>
              e.kind === "sim" ? (
                <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--link-border)" strokeWidth={1} strokeDasharray="2 4" />
              ) : (
                <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--border)" strokeWidth={1.2} />
              )
            )}
          </svg>
          {nodes.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n.id)}
              style={{
                position: "absolute",
                left: `${(n.x / W) * 100}%`,
                top: `${(n.y / H) * 100}%`,
                transform: "translate(-50%,-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 7,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: n.size,
                  height: n.size,
                  borderRadius: "50%",
                  background: `color-mix(in srgb, ${n.color} 15%, transparent)`,
                  border: `1.5px solid ${n.color}`,
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-body)", whiteSpace: "nowrap" }}>
                {n.label}
              </span>
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-fainter)" }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Chip({
  active,
  dot,
  onClick,
  children,
}: {
  active: boolean;
  dot?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--text-strong)" : "var(--border)"}`,
        background: active ? "var(--text-strong)" : "var(--bg-main)",
        color: active ? "var(--bg-main)" : "var(--text-600)",
        fontSize: 11.5,
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "var(--bg-main)" : dot }} />}
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

interface LaidNode {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
}
interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "link" | "sim";
}

/** Deterministic Fruchterman–Reingold layout with explicit + semantic edges. */
function layout(
  notes: Note[],
  vectors: Map<string, number[]>
): { nodes: LaidNode[]; edges: Edge[]; simCount: number } {
  const n = notes.length;
  if (n === 0) return { nodes: [], edges: [], simCount: 0 };

  const idx = new Map(notes.map((nt, i) => [nt.id, i]));
  const inbound = new Map<string, number>();
  const edgeKinds = new Map<string, "link" | "sim">();

  // explicit links
  for (const note of notes) {
    for (const t of outboundIds(note)) {
      if (!idx.has(t)) continue;
      inbound.set(t, (inbound.get(t) ?? 0) + 1);
      const a = idx.get(note.id)!;
      const b = idx.get(t)!;
      edgeKinds.set(a < b ? `${a}-${b}` : `${b}-${a}`, "link");
    }
  }

  // semantic edges (top-3 neighbors per node above threshold), if not already linked
  let simCount = 0;
  if (vectors.size > 0) {
    for (let i = 0; i < n; i++) {
      const vi = vectors.get(notes[i].id);
      if (!vi) continue;
      const sims: { j: number; s: number }[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const vj = vectors.get(notes[j].id);
        if (!vj) continue;
        const s = cosine(vi, vj);
        if (s >= EDGE_THRESHOLD) sims.push({ j, s });
      }
      sims.sort((a, b) => b.s - a.s);
      for (const { j } of sims.slice(0, 3)) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!edgeKinds.has(key)) {
          edgeKinds.set(key, "sim");
          simCount++;
        }
      }
    }
  }

  const edgeList = Array.from(edgeKinds.entries()).map(([key, kind]) => {
    const [a, b] = key.split("-").map(Number);
    return { a, b, kind };
  });

  // init on a circle
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(W, H) / 2 - 90;
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    xs[i] = cx + Math.cos(a) * radius;
    ys[i] = cy + Math.sin(a) * radius;
  }

  const area = (W - 120) * (H - 120);
  const k = Math.sqrt(area / n);
  let temp = (W - 120) / 8;
  const iters = 320;

  for (let it = 0; it < iters; it++) {
    const dx = new Array(n).fill(0);
    const dy = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = xs[i] - xs[j];
        let ddy = ys[i] - ys[j];
        let dist = Math.hypot(ddx, ddy) || 0.01;
        if (dist < 0.01) {
          ddx = (i - j) * 0.1;
          ddy = 0.1;
          dist = 0.1;
        }
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] += fx; dy[i] += fy;
        dx[j] -= fx; dy[j] -= fy;
      }
    }

    for (const { a, b, kind } of edgeList) {
      const ddx = xs[a] - xs[b];
      const ddy = ys[a] - ys[b];
      const dist = Math.hypot(ddx, ddy) || 0.01;
      // semantic edges pull a little more gently than explicit links
      const w = kind === "sim" ? 0.6 : 1;
      const force = ((dist * dist) / k) * w;
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[a] -= fx; dy[a] -= fy;
      dx[b] += fx; dy[b] += fy;
    }

    for (let i = 0; i < n; i++) {
      dx[i] += (cx - xs[i]) * 0.012;
      dy[i] += (cy - ys[i]) * 0.012;
    }

    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i], dy[i]) || 0.01;
      xs[i] += (dx[i] / d) * Math.min(d, temp);
      ys[i] += (dy[i] / d) * Math.min(d, temp);
      xs[i] = Math.max(60, Math.min(W - 60, xs[i]));
      ys[i] = Math.max(50, Math.min(H - 50, ys[i]));
    }
    temp *= 0.985;
  }

  const nodes: LaidNode[] = notes.map((note, i) => ({
    id: note.id,
    x: xs[i],
    y: ys[i],
    size: 13 + Math.min(18, (inbound.get(note.id) ?? 0) * 4),
    color: STATUS_COLOR[note.status],
    label: note.title.length > 26 ? note.title.slice(0, 24) + "…" : note.title,
  }));

  const edges: Edge[] = edgeList.map(({ a, b, kind }) => ({
    x1: xs[a], y1: ys[a], x2: xs[b], y2: ys[b], kind,
  }));
  return { nodes, edges, simCount };
}

const page: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: "34px 40px" };
const filterBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 16,
  padding: "10px 14px",
  marginBottom: 18,
  background: "var(--bg-sunken)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 10,
};
const select: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  borderRadius: 7,
  padding: "3px 8px",
  fontSize: 11.5,
  fontFamily: "var(--font-sans)",
  color: "var(--text-600)",
  cursor: "pointer",
  maxWidth: 150,
};
const clearBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  color: "var(--text-muted)",
  borderRadius: 7,
  padding: "3px 10px",
  fontSize: 11.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const emptyState: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 280,
  color: "var(--text-ghost)",
  fontSize: 13.5,
  border: "1px dashed var(--border)",
  borderRadius: 12,
};
const canvas: React.CSSProperties = {
  position: "relative",
  width: W,
  maxWidth: "100%",
  height: H,
  margin: "0 auto",
  background: "var(--bg-sunken)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 12,
  overflow: "hidden",
};
