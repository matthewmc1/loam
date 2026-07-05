/**
 * Offline outbox for Cadence writes.
 *
 * When the Cadence server is unreachable (plane mode, server down), task
 * creates and status changes are queued here in IndexedDB instead of being
 * lost. The queue is flushed in order the moment the server answers again.
 * Note: reachability is probed by *trying* — never by `navigator.onLine`,
 * which reports false on a plane even though a localhost Cadence works fine.
 */
import { db } from "../db/db";
import type { CadenceTask, CreateTaskInput } from "./client";
import type { CadenceStatus } from "./config";
import { uid } from "../lib/id";

export type OutboxOp =
  | {
      id: string;
      ts: number;
      kind: "create";
      /** provisional task id shown in the UI until the create syncs */
      localId: string;
      input: CreateTaskInput;
    }
  | {
      id: string;
      ts: number;
      kind: "status";
      /** a real Cadence task id (creates are edited in place, never mapped) */
      taskId: string;
      status: CadenceStatus;
    };

export async function listOps(): Promise<OutboxOp[]> {
  return db.outbox.orderBy("ts").toArray();
}

export async function enqueueCreate(input: CreateTaskInput): Promise<OutboxOp> {
  const op: OutboxOp = {
    id: uid("op"),
    ts: Date.now(),
    kind: "create",
    localId: "local_" + uid("t"),
    input,
  };
  await db.outbox.add(op);
  return op;
}

/**
 * A status change while offline. For a still-queued create we edit the queued
 * payload itself (so there is never a local→real id mapping to lose); for a
 * real task we queue one status op, replacing any earlier one for that task.
 *
 * Returns false when the id is provisional but its create op is gone (it
 * synced already) — the caller must resolve the real id instead; queueing a
 * status op against a local_ id would be permanently unsendable.
 */
export async function enqueueStatus(taskId: string, status: CadenceStatus): Promise<boolean> {
  const ops = await listOps();
  const create = ops.find((o) => o.kind === "create" && o.localId === taskId);
  if (create && create.kind === "create") {
    await db.outbox.put({ ...create, input: { ...create.input, status } });
    return true;
  }
  if (taskId.startsWith("local_")) return false;
  const prior = ops.find((o) => o.kind === "status" && o.taskId === taskId);
  if (prior && prior.kind === "status") {
    await db.outbox.put({ ...prior, status, ts: Date.now() });
    return true;
  }
  await db.outbox.add({ id: uid("op"), ts: Date.now(), kind: "status", taskId, status });
  return true;
}

export async function deleteOp(id: string): Promise<void> {
  await db.outbox.delete(id);
}

/** The provisional task a queued create renders as, until it syncs. */
export function pendingTaskFromOp(op: Extract<OutboxOp, { kind: "create" }>): CadenceTask {
  return {
    id: op.localId,
    projectId: null,
    title: op.input.title,
    status: op.input.status ?? "backlog",
    kind: op.input.kind,
    urgent: op.input.urgent,
    note: op.input.note,
    links: op.input.links,
    pending: true,
  };
}

/**
 * What the UI should show: queued creates first, then the server's tasks with
 * any queued status changes applied optimistically (flagged `pending`).
 */
export function projectTasks(ops: OutboxOp[], server: CadenceTask[]): CadenceTask[] {
  const creates = ops
    .filter((o): o is Extract<OutboxOp, { kind: "create" }> => o.kind === "create")
    .map(pendingTaskFromOp);
  const statusById = new Map(
    ops
      .filter((o): o is Extract<OutboxOp, { kind: "status" }> => o.kind === "status")
      .map((o) => [o.taskId, o.status])
  );
  const merged = server.map((t) =>
    statusById.has(t.id) ? { ...t, status: statusById.get(t.id)!, pending: true } : t
  );
  return [...creates, ...merged];
}
