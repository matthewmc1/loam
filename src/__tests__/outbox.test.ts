import { describe, expect, it } from "vitest";
import { enqueueCreate, enqueueStatus, listOps, projectTasks } from "../cadence/outbox";
import type { CadenceTask, CreateTaskInput } from "../cadence/client";

const input = (title: string) => ({ title }) as CreateTaskInput;

describe("cadence outbox", () => {
  it("a status change on a queued create edits the create instead of queueing a second op", async () => {
    const op = await enqueueCreate(input("Write it up"));
    if (op.kind !== "create") throw new Error("unreachable");
    expect(await enqueueStatus(op.localId, "done")).toBe(true);
    const ops = await listOps();
    expect(ops).toHaveLength(1);
    expect(ops[0].kind === "create" && ops[0].input.status).toBe("done");
  });

  it("refuses a status op against a provisional id whose create already synced", async () => {
    expect(await enqueueStatus("local_gone", "done")).toBe(false);
    expect(await listOps()).toHaveLength(0);
  });

  it("keeps only the latest status per real task", async () => {
    await enqueueStatus("t1", "focus");
    await enqueueStatus("t1", "done");
    const ops = await listOps();
    expect(ops).toHaveLength(1);
    expect(ops[0].kind === "status" && ops[0].status).toBe("done");
  });

  it("projects queued work over the server's list", async () => {
    await enqueueCreate(input("Offline task"));
    await enqueueStatus("t1", "done");
    const server = [
      { id: "t1", title: "One", status: "backlog" },
      { id: "t2", title: "Two", status: "backlog" },
    ] as CadenceTask[];
    const shown = projectTasks(await listOps(), server);
    expect(shown.map((t) => [t.title, t.status, !!t.pending])).toEqual([
      ["Offline task", "backlog", true],
      ["One", "done", true],
      ["Two", "backlog", false],
    ]);
  });
});
