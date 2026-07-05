import { create } from "zustand";
import {
  cadence,
  CadenceError,
  type CadenceTask,
  type CadenceUser,
  type CreateTaskInput,
} from "./client";
import { CADENCE_DEFAULT_URL, LS_URL, LS_TOKEN, type CadenceStatus } from "./config";
import { listOps, enqueueCreate, enqueueStatus, deleteOp, projectTasks } from "./outbox";
import { db } from "../db/db";

/**
 * "offline" = we have a token but the server didn't answer — writes queue in
 * the outbox and a retry loop keeps probing. "error" = the server answered
 * with a real problem (bad token etc.) — retrying won't help, the user must act.
 */
type ConnState = "off" | "checking" | "connected" | "offline" | "error";

function ls(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** unreachable (fetch threw), as opposed to an HTTP error the server sent */
function unreachable(e: unknown): boolean {
  return e instanceof CadenceError && e.status === 0;
}

/**
 * Errors that may succeed on retry — the op must be KEPT. Only a definitive
 * 4xx rejection may drop a queued op; a gateway 502 while Cadence restarts
 * must never destroy the very work the outbox exists to protect. Unknown
 * (non-Cadence) errors are treated as transient for the same reason.
 */
function transientError(e: unknown): boolean {
  if (!(e instanceof CadenceError)) return true;
  return e.status === 0 || e.status >= 500 || e.status === 408 || e.status === 429;
}

interface CadenceState {
  url: string;
  token: string;
  status: ConnState;
  msg: string;
  user: CadenceUser | null;
  tenant: string | null;
  /** projection: queued creates first, then server tasks (queued status applied) */
  tasks: CadenceTask[];
  /** outbox depth — how many writes are waiting to sync */
  queued: number;
  panelOpen: boolean;

  setPanel(open: boolean): void;
  /** load the outbox projection so queued tasks show even before/without a connection */
  init(): Promise<void>;
  configure(url: string, token: string): Promise<void>;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  createTask(input: CreateTaskInput): Promise<CadenceTask | null>;
  setTaskStatus(id: string, status: CadenceStatus): Promise<CadenceTask | null>;
  flush(): Promise<void>;
}

/** last task list the server gave us — the base the outbox projects onto */
let serverTasks: CadenceTask[] = [];
/** in-flight flush — connect/refresh await it so they can't clobber serverTasks mid-drain */
let flushPromise: Promise<void> | null = null;
/** localId → real Cadence id for creates that synced this session */
const syncedIds = new Map<string, string>();

/** cross-tab mutual exclusion: the outbox is shared IndexedDB, one drainer at a time */
async function withFlushLock(fn: () => Promise<void>): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    await navigator.locks.request("loam-cadence-flush", fn);
  } else {
    await fn();
  }
}

export const useCadence = create<CadenceState>((set, get) => {
  /** recompute the visible task list + queue depth from outbox × server state */
  const project = async () => {
    const ops = await listOps();
    set({ tasks: projectTasks(ops, serverTasks), queued: ops.length });
  };

  return {
    url: ls(LS_URL, CADENCE_DEFAULT_URL),
    token: ls(LS_TOKEN),
    status: "off",
    msg: "",
    user: null,
    tenant: null,
    tasks: [],
    queued: 0,
    panelOpen: false,

    setPanel: (open) => set({ panelOpen: open }),

    init: async () => {
      await project();
    },

    configure: async (url, token) => {
      const trimmed = { url: url.trim() || CADENCE_DEFAULT_URL, token: token.trim() };
      try {
        localStorage.setItem(LS_URL, trimmed.url);
        localStorage.setItem(LS_TOKEN, trimmed.token);
      } catch {
        /* ignore */
      }
      set({ url: trimmed.url, token: trimmed.token });
      await get().connect();
    },

    connect: async () => {
      const { url, token, status } = get();
      if (!token) {
        set({ status: "off", msg: "Not connected — add an API token." });
        return;
      }
      // don't flash the whole UI into "checking" on background retries
      if (status !== "offline") set({ status: "checking", msg: "Connecting to Cadence…" });
      try {
        if (flushPromise) await flushPromise; // never clobber serverTasks mid-drain
        const boot = await cadence.bootstrap({ url, token });
        serverTasks = boot.tasks ?? [];
        set({
          status: "connected",
          msg: "",
          user: boot.user,
          tenant: boot.tenant?.name ?? null,
        });
        await project();
        if (get().queued > 0) await get().flush();
      } catch (e) {
        if (unreachable(e)) {
          set({
            status: "offline",
            msg: "Cadence is unreachable — tasks will queue here and sync when it's back.",
          });
          await project();
        } else {
          set({ status: "error", msg: (e as Error).message, user: null });
        }
      }
    },

    refresh: async () => {
      const { url, token, status } = get();
      if (status !== "connected" && status !== "offline") return;
      try {
        if (flushPromise) await flushPromise; // never clobber serverTasks mid-drain
        serverTasks = await cadence.listTasks({ url, token });
        set({ status: "connected", msg: "" });
        await project();
        if (get().queued > 0) await get().flush();
      } catch (e) {
        if (unreachable(e)) set({ status: "offline" });
        else set({ status: "error", msg: (e as Error).message });
      }
    },

    createTask: async (input) => {
      const { url, token } = get();
      try {
        const task = await cadence.createTask({ url, token }, input);
        // never prepend an invalid/empty result — would corrupt the task list
        if (!task || !task.id) {
          set({ msg: "Cadence returned an unexpected response." });
          return null;
        }
        serverTasks = [task, ...serverTasks];
        set({ msg: "", status: "connected" });
        await project();
        // a direct write just proved the server reachable — drain anything queued
        if (get().queued > 0) await get().flush();
        return task;
      } catch (e) {
        if (unreachable(e)) {
          // plane mode / server down: queue it — the thought is not lost
          const op = await enqueueCreate(input);
          set({
            status: "offline",
            msg: "Cadence is unreachable — task queued locally, will sync when it's back.",
          });
          await project();
          return get().tasks.find((t) => t.id === (op.kind === "create" ? op.localId : "")) ?? null;
        }
        set({ msg: (e as Error).message });
        return null;
      }
    },

    setTaskStatus: async (id, status) => {
      const { url, token } = get();
      let targetId = id;
      // a still-queued create is edited in place — no network involved
      if (targetId.startsWith("local_")) {
        const attached = await enqueueStatus(targetId, status);
        if (attached) {
          await project();
          return get().tasks.find((t) => t.id === targetId) ?? null;
        }
        // the create synced while this row was on screen — retarget the real id
        const real = syncedIds.get(targetId);
        if (!real) {
          await get().refresh();
          set({ msg: "That task just synced — try again from the updated list." });
          return null;
        }
        targetId = real;
      }
      try {
        const task = await cadence.updateTask({ url, token }, targetId, { status });
        if (!task || !task.id) {
          set({ msg: "Cadence returned an unexpected response." });
          return null;
        }
        serverTasks = serverTasks.map((t) => (t.id === targetId ? task : t));
        set({ msg: "", status: "connected" });
        await project();
        // a direct write just proved the server reachable — drain anything queued
        if (get().queued > 0) await get().flush();
        return task;
      } catch (e) {
        if (unreachable(e)) {
          await enqueueStatus(targetId, status);
          set({
            status: "offline",
            msg: "Cadence is unreachable — change queued locally, will sync when it's back.",
          });
          await project();
          return get().tasks.find((t) => t.id === targetId) ?? null;
        }
        set({ msg: (e as Error).message });
        return null;
      }
    },

    /**
     * Drain the outbox in order. Holds a cross-tab Web Lock (two tabs must not
     * both POST the same queued create), re-reads every op from Dexie right
     * before sending (ops are edited in place by enqueueStatus — a snapshot
     * would replay stale payloads and then delete the user's newer edit), and
     * keeps ops on transient failures. Stops (stays offline) the moment the
     * server stops answering.
     */
    flush: async () => {
      if (flushPromise) return flushPromise;
      const drain = async () => {
        const { url, token } = get();
        // bounded passes: each pass re-lists, so edits landing mid-drain get
        // their own send instead of being lost with the deleted op
        for (let pass = 0; pass < 10; pass++) {
          const ops = await listOps();
          if (ops.length === 0) break;
          let progressed = false;
          for (const snap of ops) {
            const op = await db.outbox.get(snap.id); // live re-read: another tab may have drained it
            if (!op) continue;
            try {
              if (op.kind === "create") {
                const sentStatus = op.input.status ?? "backlog";
                const task = await cadence.createTask({ url, token }, op.input);
                if (task && task.id) {
                  syncedIds.set(op.localId, task.id);
                  // completed while the POST was in flight? follow up before deleting
                  const latest = await db.outbox.get(op.id);
                  const wanted =
                    latest?.kind === "create" ? latest.input.status ?? "backlog" : sentStatus;
                  let final = task;
                  if (wanted !== sentStatus) {
                    const patched = await cadence.updateTask({ url, token }, task.id, {
                      status: wanted,
                    });
                    if (patched && patched.id) final = patched;
                  }
                  serverTasks = [final, ...serverTasks];
                }
                await deleteOp(op.id);
                progressed = true;
              } else {
                const target = op.taskId.startsWith("local_")
                  ? syncedIds.get(op.taskId)
                  : op.taskId;
                if (!target) {
                  // orphan pointing at a provisional id we can no longer map
                  await deleteOp(op.id);
                  progressed = true;
                  continue;
                }
                const task = await cadence.updateTask({ url, token }, target, {
                  status: op.status,
                });
                if (task && task.id)
                  serverTasks = serverTasks.map((t) => (t.id === task.id ? task : t));
                // replaced with a newer status mid-request? leave it for the next pass
                const latest = await db.outbox.get(op.id);
                if (!(latest && latest.kind === "status" && latest.status !== op.status))
                  await deleteOp(op.id);
                progressed = true;
              }
            } catch (e) {
              if (transientError(e)) {
                // server unreachable/hiccuping — keep every remaining op and retry later
                set({ status: "offline" });
                return;
              }
              // a definitive rejection (4xx): this op can never succeed
              await deleteOp(op.id);
              const what = op.kind === "create" ? `“${op.input.title}”` : "a status change";
              set({ msg: `Cadence rejected ${what} while syncing: ${(e as Error).message}` });
              progressed = true;
            }
          }
          if (!progressed) break;
        }
        if ((await db.outbox.count()) === 0) set({ status: "connected" });
      };
      flushPromise = withFlushLock(drain).finally(async () => {
        flushPromise = null;
        const opsLeft = await listOps();
        set({ tasks: projectTasks(opsLeft, serverTasks), queued: opsLeft.length });
      });
      return flushPromise;
    },
  };
});

/* ---------------------- reconnect triggers (module-level) ---------------------- */

// probe again when the OS says a network came back…
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (useCadence.getState().token) void useCadence.getState().connect();
  });
}

// …and keep a slow retry loop while offline — `online` never fires when a
// *localhost* Cadence restarts, and it lies on planes anyway.
let retryTimer: number | undefined;
useCadence.subscribe((s) => {
  const wantRetry = s.status === "offline";
  if (wantRetry && retryTimer === undefined) {
    retryTimer = window.setInterval(() => {
      void useCadence.getState().connect();
    }, 25_000);
  } else if (!wantRetry && retryTimer !== undefined) {
    window.clearInterval(retryTimer);
    retryTimer = undefined;
  }
});
