import { useState } from "react";
import { useCadence } from "../cadence/store";
import { STAGES } from "../cadence/config";
import { CadenceIcon, CaretIcon } from "./icons";

const PER_STAGE = 6;

/** Cadence tasks grouped by stage, shown in the sidebar. */
export function CadenceTasks() {
  const status = useCadence((s) => s.status);
  const tasks = useCadence((s) => s.tasks);
  const setPanel = useCadence((s) => s.setPanel);
  const refresh = useCadence((s) => s.refresh);
  const [open, setOpen] = useState(true);

  const connected = status === "connected";

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
      <div style={header}>
        <button style={titleBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <CaretIcon open={open} />
          <span className="uno">Tasks</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor(status) }} />
        </button>
        <div style={{ display: "flex", gap: 2 }}>
          {connected && (
            <button style={miniBtn} className="rw" title="Refresh tasks" onClick={() => void refresh()}>
              ↻
            </button>
          )}
          <button style={miniBtn} className="rw" title="Cadence settings" onClick={() => setPanel(true)}>
            <CadenceIcon size={13} />
          </button>
        </div>
      </div>

      {open && (
        <div style={{ padding: "2px 4px 4px" }}>
          {!connected ? (
            <button style={connectBtn} className="rw" onClick={() => setPanel(true)}>
              {status === "checking" ? "Connecting to Cadence…" : status === "error" ? "Reconnect Cadence" : "Connect Cadence →"}
            </button>
          ) : tasks.length === 0 ? (
            <div style={empty}>No tasks yet. Select text in a note to create one.</div>
          ) : (
            STAGES.map((st) => {
              const items = tasks.filter((t) => t.status === st.status);
              if (items.length === 0) return null;
              return (
                <div key={st.status} style={{ marginBottom: 6 }}>
                  <div style={stageHead}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color }} />
                    <span style={{ flex: 1 }}>{st.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-fainter)" }}>{items.length}</span>
                  </div>
                  {items.slice(0, PER_STAGE).map((t) => (
                    <div key={t.id} style={taskRow} title={t.note || t.title}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, flexShrink: 0, opacity: t.status === "done" ? 0.5 : 1 }} />
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textDecoration: t.status === "done" ? "line-through" : "none",
                          color: t.status === "done" ? "var(--text-faint)" : "var(--text-600)",
                        }}
                      >
                        {t.title}
                      </span>
                    </div>
                  ))}
                  {items.length > PER_STAGE && (
                    <div style={{ ...taskRow, color: "var(--text-fainter)", paddingLeft: 21 }}>
                      +{items.length - PER_STAGE} more
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function dotColor(status: string): string {
  return status === "connected"
    ? "var(--status-verified)"
    : status === "checking"
      ? "var(--status-review)"
      : status === "error"
        ? "var(--danger)"
        : "var(--text-ghost)";
}

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "2px 10px 4px",
};
const titleBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: 0,
  color: "inherit",
};
const miniBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--text-500)",
  borderRadius: 6,
  fontSize: 13,
};
const connectBtn: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px dashed var(--border-strong)",
  background: "none",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
};
const empty: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-ghost)",
  lineHeight: 1.5,
  padding: "4px 8px",
};
const stageHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px 3px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-600)",
};
const taskRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 8px",
  paddingLeft: 14,
  fontSize: 12,
  borderRadius: 6,
};
