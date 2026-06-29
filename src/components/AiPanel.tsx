import { useEffect } from "react";
import type { Vault } from "../store/vault";
import { useAi } from "../ai/store";
import {
  WEBLLM_MODELS,
  OLLAMA_MODELS,
  WEBLLM_DEFAULT,
  OLLAMA_DEFAULT,
  type LlmModelOption,
} from "../ai/config";
import { modelInstalled } from "../ai/llm";
import { liveNotes } from "../store/selectors";
import { CheckIcon, CloseIcon } from "./icons";

const STATE_COLOR: Record<string, string> = {
  off: "var(--text-fainter)",
  loading: "var(--status-review)",
  ready: "var(--status-verified)",
  error: "var(--danger)",
};

export function AiPanel({ vault }: { vault: Vault }) {
  const s = useAi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && s.setPanel(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s]);

  if (!s.panelOpen) return null;
  const noteCount = liveNotes(vault.notes).length;

  const sel = s.model;
  const ollamaUp = s.ollamaStatus === "up";
  const installed = (model: string) => modelInstalled(s.ollamaModels, model);

  const loadDisabled =
    s.llm === "loading" ||
    (sel.backend === "webllm" && !s.webgpu) ||
    (sel.backend === "ollama" && !ollamaUp);

  // suggest the other backend when the chosen one isn't available
  const fallback: LlmModelOption | null =
    sel.backend === "webllm" && !s.webgpu
      ? OLLAMA_DEFAULT
      : sel.backend === "ollama" && !ollamaUp && s.webgpu
        ? WEBLLM_DEFAULT
        : null;

  return (
    <div style={backdrop} onMouseDown={() => s.setPanel(false)}>
      <div
        style={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Local AI"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={head}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em" }}>Local AI</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Runs entirely on your device — nothing leaves the browser.
            </div>
          </div>
          <button style={iconBtn} aria-label="Close" onClick={() => s.setPanel(false)}>
            <CloseIcon />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "4px 4px 10px" }}>
          {/* embeddings */}
          <Section
            title="Semantic embeddings"
            state={s.embed}
            msg={s.embedMsg || `${s.vectors.size}/${noteCount} notes embedded`}
          >
            <p style={desc}>
              Vectorizes notes on-device (~25&nbsp;MB model) to power semantic link suggestions and
              graph edges. The foundation under every AI feature.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={primaryBtn} disabled={s.embed === "loading"} onClick={() => void s.enableEmbeddings()}>
                {s.embed === "loading" ? "Working…" : s.embed === "ready" ? "Rebuild" : "Enable embeddings"}
              </button>
              {s.embed === "ready" && (
                <span style={{ fontSize: 12, color: "var(--status-verified-soft)" }}>
                  Suggestions &amp; graph edges are live.
                </span>
              )}
            </div>
          </Section>

          {/* generation */}
          <Section title="Reasoning model (Gemma)" state={s.llm} msg={s.llm === "ready" ? s.llmMsg : ""}>
            <p style={desc}>
              Powers concept &amp; relation extraction, contradiction detection, and grounded answers
              in Ask. Pick where it runs:
            </p>

            {/* In-browser / WebGPU — primary */}
            <BackendCard
              title="In browser · WebGPU"
              recommended={s.webgpu}
              badge={
                s.webgpu
                  ? { text: "available", tone: "ok" }
                  : { text: "not supported", tone: "bad" }
              }
              subtitle="Runs on your GPU. Zero install — downloads once, then fully offline."
            >
              {WEBLLM_MODELS.map((m) => (
                <ModelRow
                  key={m.model}
                  m={m}
                  selected={sel.backend === m.backend && sel.model === m.model}
                  disabled={!s.webgpu}
                  right={m.size}
                  onSelect={() => s.selectModel(m)}
                />
              ))}
              {!s.webgpu && (
                <div style={hint}>
                  This browser has no WebGPU. Use Chrome/Edge 121+ or Safari 18+, or run via Ollama
                  below.
                </div>
              )}
            </BackendCard>

            {/* Ollama — fallback */}
            <BackendCard
              title="Ollama · local server"
              badge={
                s.ollamaStatus === "up"
                  ? { text: `detected · ${s.ollamaModels.length} models`, tone: "ok" }
                  : s.ollamaStatus === "checking"
                    ? { text: "checking…", tone: "neutral" }
                    : { text: "not running", tone: "bad" }
              }
              subtitle="Runs larger models (Gemma 3 4B, 3n) on a local server."
              action={
                <button style={recheckBtn} onClick={() => void s.probeBackends()}>
                  Recheck
                </button>
              }
            >
              {OLLAMA_MODELS.map((m) => (
                <ModelRow
                  key={m.model}
                  m={m}
                  selected={sel.backend === m.backend && sel.model === m.model}
                  disabled={false}
                  right={ollamaUp ? (installed(m.model) ? "installed" : "not pulled") : m.size}
                  rightTone={ollamaUp ? (installed(m.model) ? "ok" : "muted") : "muted"}
                  onSelect={() => s.selectModel(m)}
                />
              ))}
              {sel.backend === "ollama" && !ollamaUp && (
                <div style={hint}>
                  Start a local server, then click Recheck:
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                    <code style={code}>ollama pull {sel.model}</code>
                    <code style={code}>OLLAMA_ORIGINS=* ollama serve</code>
                  </div>
                </div>
              )}
              {sel.backend === "ollama" && ollamaUp && !installed(sel.model) && (
                <div style={hint}>
                  Not installed yet — run <code style={code}>ollama pull {sel.model}</code>, then Recheck.
                </div>
              )}
            </BackendCard>

            {/* load + progress */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button style={primaryBtn} disabled={loadDisabled} onClick={() => void s.enableLlm()}>
                  {s.llm === "loading"
                    ? "Loading…"
                    : s.llm === "ready"
                      ? "Reload"
                      : `Load ${sel.label}`}
                </button>
                {fallback && (
                  <button style={ghostBtn} onClick={() => s.selectModel(fallback)}>
                    {fallback.backend === "webllm"
                      ? "↻ Run in browser instead"
                      : `↻ Use Ollama (${fallback.label}) instead`}
                  </button>
                )}
                {s.llm === "ready" && (
                  <button
                    style={ghostBtn}
                    disabled={s.scanning || s.embed !== "ready"}
                    onClick={() => void s.scanContradictions()}
                    title={s.embed !== "ready" ? "Enable embeddings first" : "Scan for contradictions"}
                  >
                    {s.scanning ? s.scanMsg || "Scanning…" : "Scan contradictions"}
                  </button>
                )}
              </div>

              {s.llm === "loading" && (
                <div style={{ marginTop: 10 }}>
                  <div style={progressTrack}>
                    <div style={{ ...progressFill, width: `${Math.round(s.llmProgress * 100)}%` }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>{s.llmMsg}</div>
                </div>
              )}
              {s.llm === "error" && (
                <div style={{ ...hint, marginTop: 10, color: "var(--danger)", borderColor: "var(--danger)" }}>
                  {s.llmMsg}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- pieces -------------------------------- */

function BackendCard({
  title,
  subtitle,
  badge,
  recommended,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  badge: { text: string; tone: "ok" | "bad" | "neutral" };
  recommended?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-strong)" }}>{title}</span>
        {recommended && <span style={recBadge}>recommended</span>}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Badge {...badge} />
          {action}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
        {subtitle}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "ok" | "bad" | "neutral" }) {
  const color =
    tone === "ok" ? "var(--status-verified)" : tone === "bad" ? "var(--text-fainter)" : "var(--status-review)";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 10, color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {text}
    </span>
  );
}

function ModelRow({
  m,
  selected,
  disabled,
  right,
  rightTone = "muted",
  onSelect,
}: {
  m: LlmModelOption;
  selected: boolean;
  disabled: boolean;
  right: string;
  rightTone?: "ok" | "muted";
  onSelect: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onSelect}
      style={{
        ...modelRow,
        background: selected ? "var(--hover-row)" : "transparent",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span style={{ ...radio, borderColor: selected ? "var(--text-strong)" : "var(--border-strong)" }}>
        {selected && <span style={radioDot} />}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-body)" }}>{m.label}</span>
      <span style={{ fontSize: 11, color: "var(--text-fainter)" }}>· {m.note}</span>
      <span
        style={{
          marginLeft: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: rightTone === "ok" ? "var(--status-verified)" : "var(--text-fainter)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {rightTone === "ok" && <CheckIcon size={10} />}
        {right}
      </span>
    </button>
  );
}

function Section({
  title,
  state,
  msg,
  children,
}: {
  title: string;
  state: string;
  msg: string;
  children: React.ReactNode;
}) {
  return (
    <div style={section}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          className={state === "loading" ? "pulse-dot" : undefined}
          style={{ width: 7, height: 7, borderRadius: "50%", background: STATE_COLOR[state] }}
        />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        {msg && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-fainter)", textAlign: "right" }}>
            {msg}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------- styles -------------------------------- */

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#1b1b1818",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "8vh",
  zIndex: 200,
};
const panel: React.CSSProperties = {
  width: 580,
  maxWidth: "92vw",
  maxHeight: "84vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-sidebar)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "0 24px 60px -16px #1b1b1840, 0 4px 12px #1b1b1818",
  overflow: "hidden",
  animation: "fadeUp .14s var(--ease)",
};
const head: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  padding: "16px 18px 12px",
  borderBottom: "1px solid var(--border-subtle)",
};
const section: React.CSSProperties = {
  padding: "16px 16px",
  borderBottom: "1px solid var(--border-subtle)",
};
const desc: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginBottom: 12,
};
const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "11px 12px",
  marginBottom: 10,
  background: "var(--bg-main)",
};
const recBadge: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--status-verified-soft)",
  background: "var(--link-bg)",
  border: "1px solid var(--link-border)",
  borderRadius: 4,
  padding: "0 5px",
};
const modelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: "100%",
  padding: "6px 7px",
  border: "none",
  borderRadius: 7,
  textAlign: "left",
  fontFamily: "var(--font-sans)",
};
const radio: React.CSSProperties = {
  width: 13,
  height: 13,
  borderRadius: "50%",
  border: "1.5px solid var(--border-strong)",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const radioDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--text-strong)",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  background: "var(--text-strong)",
  color: "var(--bg-main)",
  borderRadius: 8,
  padding: "7px 14px",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  color: "var(--text-600)",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const recheckBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-sidebar)",
  color: "var(--text-muted)",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const hint: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  marginTop: 8,
};
const code: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  background: "var(--bg-main)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "2px 5px",
  display: "inline-block",
};
const progressTrack: React.CSSProperties = {
  height: 6,
  borderRadius: 4,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  overflow: "hidden",
};
const progressFill: React.CSSProperties = {
  height: "100%",
  background: "var(--text-strong)",
  borderRadius: 4,
  transition: "width 0.3s var(--ease)",
};
const iconBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-faint)",
  borderRadius: 6,
};
