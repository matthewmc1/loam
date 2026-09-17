import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportVault } from "../lib/backup";

interface State {
  error: Error | null;
  exported: boolean;
}

/**
 * Last line of defence: a render error must never leave the user staring at a
 * blank page with their vault locked inside IndexedDB. The fallback imports
 * nothing from the app tree (whatever crashed may crash again) — just the
 * backup module, so the data can always be carried out.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, exported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[loam] render crash", error, info.componentStack);
  }

  render() {
    const { error, exported } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={wrap} role="alert">
        <div style={card}>
          <div className="uno" style={{ marginBottom: 10 }}>Something broke</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Loam hit an error it couldn’t recover from.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-600)", marginBottom: 18 }}>
            Your notes are safe — they live in this browser, not in the page that crashed.
            Reloading usually fixes it. If it keeps happening, export your vault first.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <button style={primary} onClick={() => location.reload()}>Reload</button>
            <button
              style={secondary}
              onClick={() =>
                void exportVault().then(
                  () => this.setState({ exported: true }),
                  (e) => console.error("[loam] export failed", e)
                )
              }
            >
              {exported ? "Exported ✓" : "Export vault"}
            </button>
          </div>
          <pre style={detail}>{error.message}</pre>
        </div>
      </div>
    );
  }
}

const wrap: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-app)",
  padding: 24,
  zoom: "var(--ui-scale)",
};
const card: React.CSSProperties = {
  width: 460,
  maxWidth: "100%",
  background: "var(--bg-main)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-xl)",
  padding: 28,
};
const btn: React.CSSProperties = {
  borderRadius: "var(--r-btn)",
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
const primary: React.CSSProperties = {
  ...btn,
  background: "var(--text-strong)",
  color: "var(--bg-main)",
  border: "1px solid var(--text-strong)",
};
const secondary: React.CSSProperties = {
  ...btn,
  background: "var(--bg-sidebar)",
  color: "var(--text-strong)",
  border: "1px solid var(--border)",
};
const detail: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-faint)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 120,
  overflow: "auto",
};
