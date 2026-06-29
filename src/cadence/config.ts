/** Cadence integration config. Cadence is the task manager Loam links work to. */

export const CADENCE_DEFAULT_URL = "http://localhost:8088";

export const LS_URL = "loam-cadence-url";
export const LS_TOKEN = "loam-cadence-token";

/** Task lifecycle status — maps to Cadence's Board columns. */
export type CadenceStatus = "backlog" | "scheduled" | "focus" | "done";

export interface StageDef {
  status: CadenceStatus;
  label: string;
  color: string;
}

/** Ordered for the sidebar: most-active first. */
export const STAGES: StageDef[] = [
  { status: "focus", label: "In focus", color: "var(--status-review)" },
  { status: "scheduled", label: "This week", color: "var(--status-verified-soft)" },
  { status: "backlog", label: "Backlog", color: "var(--text-muted)" },
  { status: "done", label: "Done", color: "var(--status-verified)" },
];

export const STAGE_LABEL: Record<CadenceStatus, string> = {
  focus: "In focus",
  scheduled: "This week",
  backlog: "Backlog",
  done: "Done",
};
