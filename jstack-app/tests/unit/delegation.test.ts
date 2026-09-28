/**
 * TK-06..TK-09 — delegation is the whole task, and a subtask is a thing you
 * can change (T-2, ADR-42).
 *
 * The defect this row exists to fix is invisible from the outside: delegating
 * used to write `delegated` and nothing else, while every surface that shows a
 * delegated task reads `owner` and `work`. The verb worked, the server
 * answered 200, and nothing on any screen moved. So these cases assert the
 * FIELDS, not the status code.
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { useSessionStore } from "@/stores/session";
import type { AgentRoster, Task } from "@/data/types";

const task = async (id: string): Promise<Task> => (await handle({ method: "GET", path: `/tasks/${id}` })).json as Task;

describe("§4.15 · the delegatee roster", () => {
  beforeEach(() => db.reset());

  it("is its own list, and says who cannot take work", async () => {
    const roster = (await handle({ method: "GET", path: "/agents" })).json as AgentRoster;
    // JQ-4 (A-65, via §4): Josh joined the roster when it became where a
    // person's own two-letter abbreviation lives. The list's MEANING is
    // unchanged — `canTakeTasks` still decides who takes work, and still says
    // no for both people.
    expect(roster.map((a) => a.id)).toEqual(["ea", "dev", "josh", "joce"]);
    expect(roster.filter((a) => a.canTakeTasks).map((a) => a.name)).toEqual(["EA", "Dev"]);
    // the point of the flag: a roster that could not say no would be a list of
    // names, and `getAgentSpend().caps` cannot answer this at all
    expect(roster.find((a) => a.id === "joce")?.canTakeTasks).toBe(false);
    expect(roster.find((a) => a.id === "josh")?.canTakeTasks).toBe(false);
  });
});

describe("TK-06 · delegating writes every field the marker reads", () => {
  beforeEach(() => db.reset());

  it("sets owner, delegatedAt, delegated and work in one call", async () => {
    const before = await task("t3");
    expect(before.owner).not.toBe("ea");

    const res = await handle({ method: "POST", path: "/tasks/t3/delegate", body: { to: "ea" } });
    expect(res.status).toBe(200);

    const after = await task("t3");
    expect(after.owner).toBe("ea");
    expect(after.delegatedAt).toBeTruthy();
    expect(after.delegated).toMatchObject({ state: "acknowledged" });
    expect(after.work).toMatchObject({ agentId: "ea", state: "queued" });
    expect(after.work?.since).toBeTruthy();
    // the activity line the card pins
    expect(after.activity.at(-1)?.text).toBe("Acknowledged — on it.");
  });

  it("defaults to the EA when no delegatee is named — the old callers still work", async () => {
    await handle({ method: "POST", path: "/tasks/t3/delegate", body: {} });
    expect((await task("t3")).owner).toBe("ea");
  });

  it("refuses somebody who does not take tasks, and changes nothing", async () => {
    // t3 is Joce's own task, so "the owner is not Joce" would pass whatever
    // the handler did — the claim is that NOTHING moved.
    const before = await task("t3");
    const res = await handle({ method: "POST", path: "/tasks/t3/delegate", body: { to: "joce" } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "to" });
    const after = await task("t3");
    expect({ owner: after.owner, delegatedAt: after.delegatedAt, work: after.work, activity: after.activity.length }).toEqual({
      owner: before.owner,
      delegatedAt: before.delegatedAt,
      work: before.work,
      activity: before.activity.length,
    });
  });

  it("hands it to the dev when the dev is asked for", async () => {
    await handle({ method: "POST", path: "/tasks/t3/delegate", body: { to: "dev" } });
    const after = await task("t3");
    expect(after.owner).toBe("dev");
    expect(after.work?.agentId).toBe("dev");
  });
});

describe("TK-08/TK-09 · a subtask is a thing you can change", () => {
  beforeEach(async () => {
    db.reset();
    useSessionStore.setState({ toast: null, undo: { entries: [] } });
    await useTasksStore.getState().load();
    await useTaskCardStore.getState().loadDetailTask("t1");
  });

  const firstSubtask = () => useTaskCardStore.getState().detailTask!.subtasks[0];

  it("ticking one stamps when, and un-ticking clears it", async () => {
    const sub = firstSubtask();
    await useTaskEditsStore.getState().patchSubtask("t1", sub.id, { done: !sub.done });
    const server = (await task("t1")).subtasks.find((s) => s.id === sub.id)!;
    expect(server.done).toBe(!sub.done);
    if (server.done) expect(server.completedAt).toBeTruthy();

    await useTaskEditsStore.getState().patchSubtask("t1", sub.id, { done: sub.done });
    const back = (await task("t1")).subtasks.find((s) => s.id === sub.id)!;
    expect(back.done).toBe(sub.done);
    if (!back.done) expect(back.completedAt).toBeUndefined();
  });

  it("the row moves before the server answers", () => {
    const sub = firstSubtask();
    void useTaskEditsStore.getState().patchSubtask("t1", sub.id, { done: !sub.done });
    expect(useTaskCardStore.getState().detailTask!.subtasks[0].done).toBe(!sub.done);
  });

  it("renaming is refused when it would empty the title", async () => {
    const sub = firstSubtask();
    const refusal = await useTaskEditsStore.getState().patchSubtask("t1", sub.id, { title: "  " });
    expect(refusal).toMatchObject({ field: "title" });
    expect((await task("t1")).subtasks.find((s) => s.id === sub.id)?.title).toBe(sub.title);
  });

  it("changing delegation moves the owner", async () => {
    const sub = firstSubtask();
    await useTaskEditsStore.getState().patchSubtask("t1", sub.id, { owner: "dev", delegatedTo: "dev" });
    expect((await task("t1")).subtasks.find((s) => s.id === sub.id)?.owner).toBe("dev");
  });

  /**
   * The one that earns the tombstone. A revert that re-adds a lookalike with a
   * new id loses the subtask's `done` and its meta, which is exactly what a
   * person would notice about "undo".
   */
  it("deleting is undoable, and what comes back is the SAME subtask", async () => {
    const sub = firstSubtask();
    await useTaskEditsStore.getState().patchSubtask("t1", sub.id, { done: true });
    const before = (await task("t1")).subtasks.find((s) => s.id === sub.id)!;

    await useTaskEditsStore.getState().deleteSubtask("t1", sub.id);
    expect((await task("t1")).subtasks.find((s) => s.id === sub.id)).toBeUndefined();
    expect(useTaskCardStore.getState().detailTask!.subtasks.find((s) => s.id === sub.id)).toBeUndefined();

    await useSessionStore.getState().undoLatest();
    const restored = (await task("t1")).subtasks.find((s) => s.id === sub.id);
    expect(restored).toBeTruthy();
    expect(restored).toMatchObject({ id: before.id, title: before.title, owner: before.owner, done: true });
  });
});

describe("A4R5-04 · a subtask added after a delete gets an id nobody holds", () => {
  // `postSubtask` minted `${taskId}-${subtasks.length + 1}`. Delete any but the
  // last and the next add reused the id of one still on the list: a tick on the
  // new row ticked the other, its menu edited the other, and a delete removed
  // both while the undo brought back one.
  beforeEach(() => db.reset());

  it("the new id is unique among live AND restorable subtasks; a tick lands on it alone; the undo restores without a collision", async () => {
    const t = await task("t1");
    expect(t.subtasks.length).toBeGreaterThan(2); // else "a delete that is not the last" is not possible
    const first = t.subtasks[0];
    await handle({ method: "DELETE", path: `/tasks/t1/subtasks/${first.id}` });

    const added = (await handle({ method: "POST", path: "/tasks/t1/subtasks", body: { title: "Call Moz about the courier", owner: "josh" } })).json as Task;
    const liveIds = added.subtasks.map((s) => s.id);
    expect(new Set(liveIds).size).toBe(liveIds.length);
    const fresh = added.subtasks.find((s) => s.title === "Call Moz about the courier") as Task["subtasks"][number];
    expect(t.subtasks.map((s) => s.id)).not.toContain(fresh.id); // not the deleted one's either: its undo may bring it back

    const others = (x: Task) => x.subtasks.filter((s) => s.id !== fresh.id).map((s) => [s.id, s.done]);
    const ticked = (await handle({ method: "PATCH", path: `/tasks/t1/subtasks/${fresh.id}`, body: { done: true } })).json as Task;
    expect(ticked.subtasks.find((s) => s.id === fresh.id)?.done).toBe(true);
    expect(others(ticked)).toEqual(others(added));

    const restored = (await handle({ method: "POST", path: "/tasks/t1/subtasks", body: { title: first.title, owner: first.owner, restoreId: first.id } })).json as Task;
    const restoredIds = restored.subtasks.map((s) => s.id);
    expect(new Set(restoredIds).size).toBe(restoredIds.length);
    expect(restored.subtasks.length).toBe(t.subtasks.length + 1);
  });
});
