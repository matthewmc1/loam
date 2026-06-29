import type { Vault } from "../../store/vault";
import { useUI } from "../../store/ui";
import { restoreNote, deleteNoteForever } from "../../store/notes";
import { STATUS_COLOR } from "../../db/types";
import { relativeTime } from "../../lib/time";

export function ArchiveView({ vault }: { vault: Vault }) {
  const { open } = useUI();
  const archived = vault.notes
    .filter((n) => n.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={page}>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 }}>
          Archive
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 30 }}>
          Archived notes keep their full history. Restore one and its provenance picks up where it left off.
        </p>

        {archived.length === 0 ? (
          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "40px 0", color: "var(--text-ghost)", fontSize: 14 }}>
            Nothing archived.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {archived.map((n) => (
              <div key={n.id} style={row}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[n.status] }} />
                <button style={titleBtn} onClick={() => open(n.id)}>{n.title}</button>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-fainter)" }}>
                  archived {relativeTime(n.archivedAt)}
                </span>
                <button style={action} onClick={() => void restoreNote(n.id)}>Restore</button>
                <button
                  style={{ ...action, color: "var(--danger)" }}
                  onClick={() => {
                    if (confirm(`Delete “${n.title}” forever? This cannot be undone.`)) void deleteNoteForever(n.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const page: React.CSSProperties = { maxWidth: "var(--editor-max)", margin: "0 auto", padding: "44px 40px 80px" };
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 0",
  borderTop: "1px solid var(--border-subtle)",
};
const titleBtn: React.CSSProperties = {
  flex: 1,
  textAlign: "left",
  border: "none",
  background: "none",
  cursor: "pointer",
  fontSize: 14.5,
  fontWeight: 500,
  color: "var(--text-body)",
  fontFamily: "var(--font-sans)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const action: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  fontSize: 12.5,
  color: "var(--text-500)",
  fontFamily: "var(--font-sans)",
};
