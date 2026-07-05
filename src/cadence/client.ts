/** Minimal typed client for the Cadence REST API (Bearer personal-access-token). */
import type { CadenceStatus } from "./config";

export interface CadenceLink {
  label: string;
  url: string;
}

export interface CadenceTask {
  id: string;
  projectId: string | null;
  title: string;
  status: CadenceStatus;
  kind?: string;
  urgent?: boolean;
  note?: string;
  deadline?: string | null;
  scheduledAt?: string | null;
  links?: CadenceLink[];
  version?: number;
  /** true = not yet synced to Cadence (queued in the offline outbox) */
  pending?: boolean;
}

export interface CadenceUser {
  id: string;
  name: string;
  email: string;
}

export interface Bootstrap {
  tenant: { id: string; name: string };
  user: CadenceUser;
  tasks: CadenceTask[];
  projects: { id: string; name: string }[];
}

export interface CreateTaskInput {
  title: string;
  status?: CadenceStatus;
  kind?: string;
  note?: string;
  urgent?: boolean;
  important?: boolean;
  deadline?: string | null;
  links?: CadenceLink[];
}

export interface CadenceConfig {
  url: string;
  token: string;
}

export class CadenceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(cfg: CadenceConfig, method: string, path: string, body?: unknown): Promise<T> {
  if (!cfg.token) throw new CadenceError("No Cadence API token set.", 0);
  let res: Response;
  try {
    res = await fetch(`${cfg.url.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CadenceError(`Can't reach Cadence at ${cfg.url}. Is the server running?`, 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // bodies from proxies/gateways may not be JSON — never let parsing mask the status
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    if (res.status === 401) throw new CadenceError("Unauthorized — check your token.", 401);
    const msg = (data as { error?: { message?: string } })?.error?.message;
    throw new CadenceError(msg ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const cadence = {
  bootstrap: (cfg: CadenceConfig) => req<Bootstrap>(cfg, "GET", "/api/v1/bootstrap"),
  // GET /tasks returns { tasks: [...] }
  listTasks: async (cfg: CadenceConfig) =>
    (await req<{ tasks: CadenceTask[] }>(cfg, "GET", "/api/v1/tasks"))?.tasks ?? [],
  createTask: (cfg: CadenceConfig, input: CreateTaskInput) =>
    req<CadenceTask>(cfg, "POST", "/api/v1/tasks", input),
  updateTask: (cfg: CadenceConfig, id: string, patch: Partial<Pick<CadenceTask, "status" | "title" | "note" | "urgent">>) =>
    req<CadenceTask>(cfg, "PATCH", `/api/v1/tasks/${id}`, patch),
};
