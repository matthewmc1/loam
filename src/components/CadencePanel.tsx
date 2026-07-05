import { useEffect, useState } from "react";
import { useCadence } from "../cadence/store";
import { STAGES } from "../cadence/config";
import { CloseIcon } from "./icons";

const STATE_COLOR: Record<string, string> = {
  off: "var(--text-fainter)",
  checking: "var(--status-review)",
  connected: "var(--status-verified)",
  offline: "var(--status-review)",
  error: "var(--danger)",
};

export function CadencePanel() {
  const s = useCadence();
  const [url, setUrl] = useState(s.url);
  const [token, setToken] = useState(s.token);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && s.setPanel(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s]);

  if (!s.panelOpen) return null;

  const counts = (status: string) => s.tasks.filter((t) => t.status === status).length;

  return (
    <div style={backdrop} onMouseDown={() => s.setPanel(false)}>
      <div style={panel} role="dialog" aria-modal="true" aria-label="Cadence" onMouseDown={(e) => e.stopPropagation()}>
        <div style={head}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              className={s.status === "checking" ? "pulse-dot" : undefined}
              style={{ width: 8, height: 8, borderRadius: "50%", background: STATE_COLOR[s.status] }}
            />
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em" }}>Cadence</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Link notes to real work — turn thoughts into tasks, track them over time.
              </div>
            </div>
          </div>
          <button style={iconBtn} aria-label="Close" onClick={() => s.setPanel(false)}>
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: "16px 18px" }}>
          {s.status === "connected" ? (
            <div style={connectedBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Connected</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {s.user?.email}
                  {s.tenant ? ` · ${s.tenant}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {STAGES.map((st) => (
                  <span key={st.status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-600)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
                    {st.label} <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-fainter)" }}>{counts(st.status)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : s.status === "offline" ? (
            <div style={connectedBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Offline</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {s.queued > 0 ? `${s.queued} change${s.queued > 1 ? "s" : ""} queued` : "retrying in the background"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-600)", lineHeight: 1.5 }}>
                Cadence isn't answering. Keep working — tasks you create or complete are stored
                locally and sync automatically the moment it's reachable again.
              </div>
            </div>
          ) : (
            <p style={desc}>
              Connect Loam to your local Cadence workspace. Tasks you create from notes appear on your
              Cadence board, and your board shows up in the Loam sidebar by stage.
            </p>
          )}

          <label style={fieldLabel}>Server URL</label>
          <input style={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8088" spellCheck={false} />

          <label style={fieldLabel}>API token</label>
          <input
            style={input}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="cdnc_…"
            spellCheck={false}
            autoComplete="off"
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <button style={primaryBtn} disabled={s.status === "checking"} onClick={() => void s.configure(url, token)}>
              {s.status === "checking"
                ? "Connecting…"
                : s.status === "connected"
                  ? "Reconnect"
                  : s.status === "offline"
                    ? "Retry now"
                    : "Connect"}
            </button>
            {s.status === "connected" && (
              <button style={ghostBtn} onClick={() => void s.refresh()}>
                Refresh tasks
              </button>
            )}
          </div>

          {s.msg && (s.status === "error" || s.status === "connected") && (
            <div style={{ ...hint, marginTop: 12, color: "var(--danger)", borderColor: "var(--danger)" }}>{s.msg}</div>
          )}

          <div style={{ ...hint, marginTop: 12 }}>
            Get a token from Cadence: start it (<code style={code}>cd ~/cadence/server && go run ./cmd/cadence-server</code>),
            sign in at <code style={code}>localhost:5173</code>, then{" "}
            <strong>account menu → API tokens → mint</strong>. Paste the <code style={code}>cdnc_…</code> token above.
            Nothing leaves your machine.
          </div>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#1b1b1818",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "10vh",
  zIndex: 200,
};
const panel: React.CSSProperties = {
  width: 520,
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
const desc: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginBottom: 14,
};
const connectedBox: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-main)",
  borderRadius: 10,
  padding: "11px 12px",
  marginBottom: 16,
};
const fieldLabel: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-fainter)",
  margin: "10px 0 5px",
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-input)",
  borderRadius: 8,
  padding: "8px 11px",
  outline: "none",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  color: "var(--text-body)",
  boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  background: "var(--text-strong)",
  color: "var(--bg-main)",
  borderRadius: 8,
  padding: "8px 16px",
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
  padding: "8px 12px",
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const hint: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  lineHeight: 1.6,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 11px",
};
const code: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  background: "var(--bg-main)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "1px 5px",
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
