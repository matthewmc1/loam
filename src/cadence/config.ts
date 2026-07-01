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

/** The URL scheme a Cadence task uses to point back at its source note. */
export function loamNoteUrl(noteId: string): string {
  return `loam://note/${noteId}`;
}

/** The source-note id a task links back to, if any. */
export function taskNoteId(task: { links?: { url: string }[] }): string | null {
  for (const l of task.links ?? []) {
    const m = /^loam:\/\/note\/(.+)$/.exec(l.url);
    if (m) return m[1];
  }
  return null;
}
