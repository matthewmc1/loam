/**
 * Decisions — a structured block inside a note's prose. Unlike a heading that
 * merely says "Decision", this is data: it has a status and a date, so the
 * vault can answer "what's still open?" and "what did we decide, and when?".
 */
import { docToText, walk, type PMNode } from "./doc";

export type DecisionStatus = "open" | "decided" | "reversed";

export const DECISION_STATUSES: DecisionStatus[] = ["open", "decided", "reversed"];

export const DECISION_LABEL: Record<DecisionStatus, string> = {
  open: "Open",
  decided: "Decided",
  reversed: "Reversed",
};

export const DECISION_COLOR: Record<DecisionStatus, string> = {
  open: "var(--status-review)",
  decided: "var(--status-verified)",
  reversed: "var(--text-fainter)",
};

export interface Decision {
  id: string;
  status: DecisionStatus;
  /** when it left "open" — null while undecided */
  decidedAt: number | null;
  /** the first line of the block: what is being decided */
  statement: string;
}

/** Every decision block in a doc, in reading order. */
export function extractDecisions(doc: PMNode | unknown): Decision[] {
  const out: Decision[] = [];
  walk(doc as PMNode, (n) => {
    if (n.type !== "decision") return;
    const status = DECISION_STATUSES.includes(n.attrs?.status as DecisionStatus)
      ? (n.attrs!.status as DecisionStatus)
      : "open";
    out.push({
      id: String(n.attrs?.id ?? ""),
      status,
      decidedAt: typeof n.attrs?.decidedAt === "number" ? n.attrs.decidedAt : null,
      statement: docToText(n.content?.[0]) || "Untitled decision",
    });
  });
  return out;
}
