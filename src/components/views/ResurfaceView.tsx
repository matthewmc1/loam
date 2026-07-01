import { useState } from "react";
import type { Vault } from "../../store/vault";
import { useDismissals } from "../../store/vault";
import { useUI } from "../../store/ui";
import { useAi } from "../../ai/store";
import {
  resurfaceItems,
  vaultHealth,
  type ResurfaceItem,
  type HealthNudge,
} from "../../store/selectors";
import {
  linkNotes,
  resolveContradiction,
  markReviewed,
  snoozeReview,
  setType,
  archiveNote,
  createNote,
  addTag,
  dismissForever,
} from "../../store/notes";

const KIND_META = {
  contradiction: { color: "var(--danger)", label: "Contradiction" },
  review: { color: "var(--status-review)", label: "Spaced review" },
  suggestion: { color: "var(--status-verified)", label: "Suggested link" },
} as const;

export function ResurfaceView({ vault }: { vault: Vault }) {
  const { open } = useUI();
  const dismissedForever = useDismissals();
  const aiVectors = useAi((s) => s.vectors);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const items = resurfaceItems(vault.notes, vault.events, aiVectors).filter(
    (i) => !dismissedForever.has(i.id)
  );
  const health = vaultHealth(vault.notes);
  const nudges = health.nudges.filter((n) => !dismissedForever.has(n.key));

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={page}>
        <h1 style={h1}>Resurface</h1>
        <p style={sub}>
          Notes drifting, due for review, or worth reconnecting — knowledge kept alive.
        </p>

        <div style={statsRow}>
          <Stat n={health.overdue} label="due for review" warn={health.overdue > 0} />
          <Stat n={health.orphans} label={health.orphans === 1 ? "orphan" : "orphans"} />
          <Stat n={health.fleeting} label="fleeting" />
        </div>

        {items.length === 0 && (
          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "40px 0", color: "var(--text-ghost)", fontSize: 14 }}>
            Nothing to resurface. Your vault is current.
          </div>
        )}

        {items.map((item) => (
          <Card
            key={item.id}
            item={item}
            done={linked.has(item.id) ? "linked" : reviewed.has(item.id) ? "reviewed" : null}
            onOpen={() => open(item.note.id)}
            onOpenRelated={() => item.related && open(item.related.id)}
            onPrimary={() => {
              if (item.kind === "contradiction") {
                void resolveContradiction(item.note.id);
              } else if (item.kind === "suggestion" && item.related) {
                void linkNotes(item.note.id, item.related.id, {
                  type: "related",
                  rationale: item.detail,
                  origin: "resurface",
                });
                setLinked((l) => new Set(l).add(item.id));
              } else {
                void markReviewed(item.note.id);
                setReviewed((r) => new Set(r).add(item.id));
              }
            }}
            onSnooze={() => void snoozeReview(item.note.id)}
            onDismiss={() => void dismissForever(item.id)}
          />
        ))}

        {nudges.length > 0 && (
          <>
            <div className="uno" style={{ marginTop: 44, marginBottom: 4 }}>
              Vault health
            </div>
            <p style={{ ...sub, marginBottom: 8 }}>
              Maturity pressure — fleeting notes that earned promotion, dead weight, missing maps.
            </p>
            {nudges.map((n) => (
              <NudgeCard key={n.key} nudge={n} onOpenNote={open} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: warn ? "var(--accent-action)" : "var(--text-600)" }}>
        {n}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</span>
    </span>
  );
}

function NudgeCard({
  nudge,
  onOpenNote,
}: {
  nudge: HealthNudge;
  onOpenNote: (id: string) => void;
}) {
  const [done, setDone] = useState<string | null>(null);

  const act = async () => {
    if (nudge.kind === "promote" && nudge.note) {
      await setType(nudge.note.id, "Permanent");
      setDone("Promoted to Permanent.");
    } else if (nudge.kind === "archive" && nudge.note) {
      await archiveNote(nudge.note.id);
      setDone("Archived — restore anytime from Archive.");
    } else if (nudge.kind === "moc" && nudge.tag) {
      const cap = nudge.tag[0].toUpperCase() + nudge.tag.slice(1);
      const id = await createNote({ title: `${cap} — map of content`, type: "Map of Content" });
      await addTag(id, nudge.tag);
      onOpenNote(id);
    }
  };

  const actionLabel =
    nudge.kind === "promote" ? "Promote to Permanent" : nudge.kind === "archive" ? "Archive" : "Create the map";

  return (
    <div style={card}>
      <div style={cardHead}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-action)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent-action)" }}>
          {nudge.kind === "moc" ? "Missing map" : nudge.kind === "promote" ? "Promotion" : "Dead weight"}
        </span>
      </div>
      {done ? (
        <div style={{ fontSize: 14, color: "var(--status-verified-soft)", fontWeight: 500 }}>✓ {done}</div>
      ) : (
        <>
          {nudge.note ? (
            <button style={cardTitleBtn} onClick={() => onOpenNote(nudge.note!.id)}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>{nudge.note.title}</div>
              <div style={detail}>{nudge.reason}</div>
            </button>
          ) : (
            <div style={{ ...detail, marginBottom: 2 }}>{nudge.reason}</div>
          )}
          <div style={{ display: "flex", gap: 18, marginTop: 13 }}>
            <button style={primaryAction} onClick={() => void act()}>{actionLabel}</button>
            <button style={ghostAction} onClick={() => void dismissForever(nudge.key)}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  item,
  done,
  onOpen,
  onOpenRelated,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  item: ResurfaceItem;
  done: "linked" | "reviewed" | null;
  onOpen: () => void;
  onOpenRelated: () => void;
  onPrimary: () => void;
  onSnooze: () => void;
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
          {done === "linked" ? (
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
      ) : done === "reviewed" ? (
        <div style={{ fontSize: 14, color: "var(--status-verified-soft)", fontWeight: 500 }}>
          ✓ Reviewed. The clock resets — it'll ask again later, less often.
        </div>
      ) : (
        <>
          <button style={cardTitleBtn} onClick={onOpen}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 5 }}>{item.note.title}</div>
            <div style={detail}>{item.detail}</div>
          </button>
          <div style={{ display: "flex", gap: 18, marginTop: 13 }}>
            <button style={primaryAction} onClick={onPrimary}>
              {item.kind === "contradiction" ? "Mark resolved" : "Mark reviewed"}
            </button>
            <button style={ghostAction} onClick={onOpen}>Open note</button>
            {item.kind === "review" && (
              <button style={ghostAction} onClick={onSnooze}>Snooze 7d</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const page: React.CSSProperties = { maxWidth: "var(--editor-max)", margin: "0 auto", padding: "44px 40px 80px" };
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 };
const sub: React.CSSProperties = { fontSize: 14, color: "var(--text-muted)", marginBottom: 30 };
const statsRow: React.CSSProperties = {
  display: "flex",
  gap: 22,
  alignItems: "center",
  marginBottom: 26,
  paddingBottom: 4,
};
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
