import { useState } from "react";
import type { Vault } from "../../store/vault";
import { useUI } from "../../store/ui";
import { resurfaceItems, type ResurfaceItem } from "../../store/selectors";
import { linkNotes, resolveContradiction } from "../../store/notes";

const KIND_META = {
  contradiction: { color: "var(--danger)", label: "Contradiction" },
  review: { color: "var(--status-review)", label: "Spaced review" },
  suggestion: { color: "var(--status-verified)", label: "Suggested link" },
} as const;

export function ResurfaceView({ vault }: { vault: Vault }) {
  const { open } = useUI();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const items = resurfaceItems(vault.notes, vault.events).filter((i) => !dismissed.has(i.id));

  const dismiss = (id: string) => setDismissed((d) => new Set(d).add(id));

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={page}>
        <h1 style={h1}>Resurface</h1>
        <p style={sub}>
          Notes drifting, due for review, or worth reconnecting — knowledge kept alive.
        </p>

        {items.length === 0 && (
          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "40px 0", color: "var(--text-ghost)", fontSize: 14 }}>
            Nothing to resurface. Your vault is current.
          </div>
        )}

        {items.map((item) => (
          <Card
            key={item.id}
            item={item}
            done={linked.has(item.id)}
            onOpen={() => open(item.note.id)}
            onOpenRelated={() => item.related && open(item.related.id)}
            onPrimary={() => {
              if (item.kind === "contradiction") {
                void resolveContradiction(item.note.id);
                dismiss(item.id);
              } else if (item.kind === "suggestion" && item.related) {
                void linkNotes(item.note.id, item.related.id);
                setLinked((l) => new Set(l).add(item.id));
              } else {
                open(item.note.id);
              }
            }}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Card({
  item,
  done,
  onOpen,
  onOpenRelated,
  onPrimary,
  onDismiss,
}: {
  item: ResurfaceItem;
  done: boolean;
  onOpen: () => void;
  onOpenRelated: () => void;
  onPrimary: () => void;
  onDismiss: () => void;
}) {
  const meta = KIND_META[item.kind];

  return (
    <div style={card}>
      <div style={cardHead}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: meta.color }}>
          {meta.label}
        </span>
        {item.when && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-fainter)" }}>
            {item.when}
          </span>
        )}
      </div>

      {item.kind === "suggestion" && item.related ? (
        <>
          {done ? (
            <div style={{ fontSize: 14, color: "var(--status-verified-soft)", fontWeight: 500 }}>
              ✓ Linked. Both notes now share a backlink.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", marginBottom: 11 }}>
                <button style={chip} onClick={onOpen}>{item.note.title}</button>
                <span style={{ color: "var(--text-fainter)" }}>⟷</span>
                <button style={chip} onClick={onOpenRelated}>
                  {item.related.title}
                </button>
              </div>
              <div style={detail}>{item.detail}</div>
              <div style={{ display: "flex", gap: 18, marginTop: 13 }}>
                <button style={primaryAction} onClick={onPrimary}>Link them</button>
                <button style={ghostAction} onClick={onDismiss}>Dismiss</button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <button style={cardTitleBtn} onClick={onOpen}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 5 }}>{item.note.title}</div>
            <div style={detail}>{item.detail}</div>
          </button>
          <div style={{ display: "flex", gap: 18, marginTop: 13 }}>
            <button style={primaryAction} onClick={onPrimary}>
              {item.kind === "contradiction" ? "Mark resolved" : "Review now"}
            </button>
            <button style={ghostAction} onClick={item.kind === "contradiction" ? onOpen : onDismiss}>
              {item.kind === "contradiction" ? "Open note" : "Snooze"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const page: React.CSSProperties = { maxWidth: "var(--editor-max)", margin: "0 auto", padding: "44px 40px 80px" };
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 };
const sub: React.CSSProperties = { fontSize: 14, color: "var(--text-muted)", marginBottom: 30 };
const card: React.CSSProperties = { borderTop: "1px solid var(--border-subtle)", padding: "22px 0" };
const cardHead: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const cardTitleBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "none",
  cursor: "pointer",
  borderRadius: 8,
  padding: 8,
  margin: -8,
};
const detail: React.CSSProperties = { fontSize: 14, color: "var(--text-500)", lineHeight: 1.55 };
const chip: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  padding: "6px 11px",
  borderRadius: 7,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  color: "var(--text-body)",
};
const primaryAction: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text-strong)",
  background: "none",
  border: "none",
  borderBottom: "1px solid var(--border-strong)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  padding: 0,
};
const ghostAction: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-faint)",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  padding: 0,
};
