import { useState } from "react";
import type { Vault } from "../../store/vault";
import { useUI } from "../../store/ui";
import { useAi } from "../../ai/store";
import { embedder } from "../../ai/embeddings";
import { chat } from "../../ai/llm";
import { cosine } from "../../ai/vectors";
import { ASK_TOP_K } from "../../ai/config";
import { liveNotes, activeContradiction } from "../../store/selectors";
import { STATUS_COLOR, type Note } from "../../db/types";

const STOP = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "what", "whats",
  "with", "this", "that", "from", "has", "have", "why", "how", "does", "did",
  "can", "all", "any", "out", "its", "is", "of", "on", "in", "to", "a", "i",
  "my", "me", "do", "be", "or", "as", "an", "it", "core",
]);

interface Source {
  note: Note;
  flag: string | null;
}
interface Exchange {
  q: string;
  answer: string[];
  sources: Source[];
  via?: "gemma" | "keyword";
}

export function AskView({ vault }: { vault: Vault }) {
  const { open } = useUI();
  const notes = liveNotes(vault.notes);
  const [input, setInput] = useState("");

  const [history, setHistory] = useState<Exchange[]>([]);
  const exchanges = history;

  const aiEmbed = useAi((s) => s.embed);
  const aiLlm = useAi((s) => s.llm);
  const aiVectors = useAi((s) => s.vectors);
  const modelLabel = useAi((s) => s.model.label);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    try {
      // 1. pick sources — semantic retrieval if embeddings are ready, else keywords
      let sources: Source[];
      if (aiEmbed === "ready" && aiVectors.size > 0) {
        const [qv] = await embedder.embed([q]);
        sources = notes
          .filter((n) => aiVectors.has(n.id))
          .map((n) => ({ note: n, s: cosine(qv, aiVectors.get(n.id)!) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, ASK_TOP_K)
          .map((r) => ({ note: r.note, flag: flagFor(r.note, vault) }));
      } else {
        sources = synthesize(q, notes, vault).sources;
      }

      // 2. answer — grounded generation via Gemma if ready, else templated synthesis
      let answer: string[];
      let via: "gemma" | "keyword";
      if (aiLlm === "ready" && sources.length > 0) {
        via = "gemma";
        const ctx = sources.map((s) => `# ${s.note.title}\n${s.note.text}`).join("\n\n");
        const raw = await chat(
          [
            {
              role: "system",
              content:
                "You answer using ONLY the provided notes from the user's own knowledge base. " +
                "Be concise — at most two short paragraphs. Never invent facts. Refer to notes by their title.",
            },
            { role: "user", content: `NOTES:\n${ctx}\n\nQUESTION: ${q}` },
          ],
          false
        );
        answer = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 4);
        if (answer.length === 0) answer = [raw.trim() || "(no answer)"];
      } else {
        via = "keyword";
        answer = synthesize(q, notes, vault).answer;
      }

      setHistory((h) => [...h, { q, answer, sources, via }]);
    } catch (e) {
      setHistory((h) => [
        ...h,
        { q, answer: [`Local model error: ${(e as Error).message}`], sources: [], via: "keyword" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={page}>
          <div className="uno" style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span>Ask · across {notes.length} notes</span>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <span style={{ color: aiLlm === "ready" ? "var(--status-verified-soft)" : "var(--text-fainter)" }}>
              {aiLlm === "ready"
                ? `${modelLabel} + semantic`
                : aiEmbed === "ready"
                  ? "semantic retrieval"
                  : "keyword match"}
            </span>
          </div>

          {exchanges.map((ex, i) => (
            <div key={i} style={{ marginBottom: 30 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
                <div style={userBubble}>{ex.q}</div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={avatar}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--bg-app)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, lineHeight: 1.72, color: "var(--text-body)" }}>
                    {ex.answer.map((p, j) => (
                      <p key={j} style={{ marginBottom: 14 }}>{p}</p>
                    ))}
                  </div>
                  {ex.sources.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
                      <div className="uno" style={{ marginBottom: 10 }}>
                        Synthesized from {ex.sources.length} note{ex.sources.length > 1 ? "s" : ""}
                        {ex.via === "gemma" ? ` · via ${modelLabel}` : ex.via === "keyword" ? " · keyword" : ""}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {ex.sources.map((s) => (
                          <button key={s.note.id} className="rw" style={sourceRow} onClick={() => open(s.note.id)}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[s.note.status] }} />
                            <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-body)" }}>{s.note.title}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.flag ? "var(--danger)" : "var(--status-verified)" }}>
                              {s.flag ?? "verified"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* composer */}
      <div style={composerWrap}>
        <div style={composer}>
          <input
            style={composerInput}
            placeholder={busy ? "Thinking…" : "Ask across your notes…"}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
          />
          <button style={sendBtn} onClick={() => void ask()} disabled={!input.trim() || busy}>
            {busy ? "…" : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}

function flagFor(n: Note, vault: Vault): string | null {
  if (activeContradiction(vault.events, n.id)) return "1 claim outdated";
  if (n.status === "review") return "needs review";
  return null;
}

function synthesize(q: string, notes: Note[], vault: Vault): Exchange {
  const terms = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

  const scored = notes
    .map((n) => {
      const hay = (n.title + " " + n.tags.join(" ") + " " + n.text).toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (n.title.toLowerCase().includes(t)) score += 3;
        if (n.tags.some((tag) => tag.toLowerCase().includes(t))) score += 2;
        const m = hay.split(t).length - 1;
        score += m;
      }
      return { note: n, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, ASK_TOP_K);

  if (scored.length === 0) {
    return {
      q,
      answer: [
        "Nothing in your vault speaks to that yet. Capture a fleeting note and Loam will start drawing connections as it grows.",
      ],
      sources: [],
    };
  }

  const top = scored.map((s) => s.note);
  const titles = top.map((n) => `“${n.title}”`);
  const flagged = top.filter((n) => activeContradiction(vault.events, n.id) || n.status === "review");

  const answer = [
    `Across your notes, the strongest threads on this are ${joinList(titles)}. ${top[0].text.slice(0, 160)}${top[0].text.length > 160 ? "…" : ""}`,
  ];
  if (flagged.length > 0) {
    answer.push(
      `Heads up: ${joinList(flagged.map((n) => `“${n.title}”`))} ${flagged.length > 1 ? "are" : "is"} flagged for review — worth re-verifying before you lean on ${flagged.length > 1 ? "them" : "it"}.`
    );
  }

  return {
    q,
    answer,
    sources: top.map((n) => ({ note: n, flag: flagFor(n, vault) })),
  };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

const page: React.CSSProperties = { maxWidth: "var(--editor-max)", margin: "0 auto", padding: "44px 40px 30px" };
const userBubble: React.CSSProperties = {
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: "12px 12px 3px 12px",
  padding: "11px 15px",
  fontSize: 14.5,
  maxWidth: "84%",
};
const avatar: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  background: "var(--text-strong)",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 2,
};
const sourceRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: 8,
  border: "none",
  background: "none",
  cursor: "pointer",
  borderRadius: 7,
  textAlign: "left",
};
const composerWrap: React.CSSProperties = {
  borderTop: "1px solid var(--border-subtle)",
  padding: "16px 40px 22px",
};
const composer: React.CSSProperties = {
  maxWidth: "var(--editor-max)",
  margin: "0 auto",
  display: "flex",
  gap: 10,
  alignItems: "center",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "6px 6px 6px 14px",
};
const composerInput: React.CSSProperties = {
  flex: 1,
  border: "none",
  background: "none",
  outline: "none",
  fontFamily: "var(--font-sans)",
  fontSize: 14.5,
  color: "var(--text-body)",
};
const sendBtn: React.CSSProperties = {
  border: "none",
  background: "var(--text-strong)",
  color: "var(--bg-main)",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
