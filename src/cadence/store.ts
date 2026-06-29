import { create } from "zustand";
import { cadence, type CadenceTask, type CadenceUser, type CreateTaskInput } from "./client";
import { CADENCE_DEFAULT_URL, LS_URL, LS_TOKEN } from "./config";

type ConnState = "off" | "checking" | "connected" | "error";

function ls(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

interface CadenceState {
  url: string;
  token: string;
  status: ConnState;
  msg: string;
  user: CadenceUser | null;
  tenant: string | null;
  tasks: CadenceTask[];
  panelOpen: boolean;

  setPanel(open: boolean): void;
  configure(url: string, token: string): Promise<void>;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  createTask(input: CreateTaskInput): Promise<CadenceTask | null>;
}

export const useCadence = create<CadenceState>((set, get) => ({
  url: ls(LS_URL, CADENCE_DEFAULT_URL),
  token: ls(LS_TOKEN),
  status: "off",
  msg: "",
  user: null,
  tenant: null,
  tasks: [],
  panelOpen: false,

  setPanel: (open) => set({ panelOpen: open }),

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
    const { url, token } = get();
    if (!token) {
      set({ status: "off", msg: "Not connected — add an API token." });
      return;
    }
    set({ status: "checking", msg: "Connecting to Cadence…" });
    try {
      const boot = await cadence.bootstrap({ url, token });
      set({
        status: "connected",
        msg: "",
        user: boot.user,
        tenant: boot.tenant?.name ?? null,
        tasks: boot.tasks ?? [],
      });
    } catch (e) {
      set({ status: "error", msg: (e as Error).message, user: null });
    }
  },

  refresh: async () => {
    const { url, token, status } = get();
    if (status !== "connected") return;
    try {
      set({ tasks: await cadence.listTasks({ url, token }) });
    } catch (e) {
      set({ status: "error", msg: (e as Error).message });
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
      set({ tasks: [task, ...get().tasks], msg: "" });
      return task;
    } catch (e) {
      set({ msg: (e as Error).message });
      return null;
    }
  },
}));
