/**
 * stores/taskCard.ts (Stage 5d P-2, F-13) — the open card, and the one lookup
 * behind it.
 *
 * `completeTask` and its undo moved here from `stores/tasks.test.ts` with the
 * store. `findTask` and `createTask` are the new claims: the lookup order that
 * three hand-written searches used to disagree on (the card's copy, then the
 * list, then the tick that raised the confirm — B-26), and the goal card's
 * task creation, which sat in a component with only an e2e (LG-03) over it.
 */
import { reset as resetDb } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { todayKey } from "@/lib/time";
import { useSessionStore } from "@/stores/session";
import { findTask, INITIAL as CARD_INITIAL, useTaskCardStore } from "@/stores/taskCard";
import { INITIAL as TASKS_INITIAL, useTasksStore } from "@/stores/tasks";
import type { Task } from "@/data/types";

const fromServer = async (id: string): Promise<Task> => (await handle({ method: "GET", path: `/tasks/${id}` })).json as Task;
const listed = (id: string) => useTasksStore.getState().list.find((t) => t.id === id);

beforeEach(() => {
  resetDb();
  useSessionStore.setState({ undo: { entries: [] }, toast: null, modal: null, modalPayload: undefined });
  // F-84: reset from each store's own declaration, not a hand-typed copy
  useTasksStore.setState(TASKS_INITIAL);
  useTaskCardStore.setState(CARD_INITIAL);
});

describe("findTask · the freshest copy the app holds", () => {
  it("prefers the open card's copy to the list's, so an optimistic edit is what a caller sees", async () => {
    await useTasksStore.getState().load();
    await useTaskCardStore.getState().loadDetailTask("t1");
    useTaskCardStore.setState({ detailTask: { ...useTaskCardStore.getState().detailTask!, title: "the card's own copy" } });
    expect(findTask("t1")?.title).toBe("the card's own copy");
    // the partner: the list still holds the OLD title, so the order was what decided
    expect(listed("t1")?.title).not.toBe("the card's own copy");
  });

  it("falls back to the list, then to the tick that raised the confirm — Today's checkbox has no list (B-26)", async () => {
    await useTasksStore.getState().load();
    const t5 = listed("t5")!;
    expect(findTask("t5")).toBe(t5);

    useTasksStore.setState({ list: [] });
    expect(findTask("t5")).toBeNull();
    useTaskCardStore.setState({ pendingComplete: t5 });
    expect(findTask("t5")).toBe(t5);
  });

  it("a task the app does not hold is null, never a lookalike", () => {
    expect(findTask("no-such-task")).toBeNull();
  });
});

describe("completeTask · undoable, and the list follows", () => {
  beforeEach(async () => {
    await useTasksStore.getState().load();
  });

  it("finishes it, reloads (the list view drops done tasks), and pushes an undo entry", async () => {
    expect(listed("t1")!.status).not.toBe("done");
    // T-3: `requestComplete` is the one tick, and for t1 (open subtasks) it
    // opens the confirm; `completeTask(id, true)` is what "Yes, complete all" calls
    await useTaskCardStore.getState().completeTask("t1", true, listed("t1")!);
    expect(listed("t1")).toBeUndefined();
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);

    await useSessionStore.getState().undoLatest();
    await useTasksStore.getState().load();
    expect(listed("t1")?.status).not.toBe("done");
  });

  it("surfaces the completed task once the view switches to 'done'", async () => {
    await useTaskCardStore.getState().completeTask("t1", true, listed("t1")!);
    await useTasksStore.getState().setView("done");
    expect(listed("t1")?.status).toBe("done");
  });

  it("A4R3-04: a tick on Today, with no list and no confirm, is still undoable", async () => {
    // B-26's twin, and the branch no spec drove. `CompleteConfirm` was given
    // its SUBJECT when B-26 found it searching an empty list; `completeTask`
    // was left looking the task up, and `requestComplete` — which HAS the task
    // — passed only its id. On Today the tasks list has never loaded, no card
    // is open, and `pendingComplete` is set only when the confirm was raised,
    // so for a task with no open subtasks `findTask` returned null, the whole
    // undo block was skipped, and the completion was written with no undo
    // entry AND NO TOAST: the row simply left the list.
    //
    // Session-order dependent, which is worse than a flat bug — visit Tasks
    // first and the same tick on the same task behaves correctly.
    const t2 = listed("t2")!;
    expect(t2.subtasks.every((s) => s.done)).toBe(true); // no confirm on this path
    useTasksStore.setState({ list: [] }); // a cold Today: the list never loaded
    useTaskCardStore.setState({ detailTask: null, pendingComplete: null });

    await useTaskCardStore.getState().requestComplete(t2);

    expect((await fromServer("t2")).status).toBe("done");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    expect(useSessionStore.getState().toast?.message).toBe("Completed");

    await useSessionStore.getState().undoLatest();
    expect((await fromServer("t2")).status).toBe(t2.status);
  });

  it("the snapshot the undo restores comes from the tick when the list is empty (B-26)", async () => {
    const t5 = listed("t5")!;
    useTasksStore.setState({ list: [] });
    useTaskCardStore.setState({ pendingComplete: t5 });
    await useTaskCardStore.getState().completeTask("t5", false, t5);
    expect((await fromServer("t5")).status).toBe("done");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);
    await useSessionStore.getState().undoLatest();
    expect((await fromServer("t5")).status).toBe(t5.status);
  });
});

describe("createTask · a task made from a goal's card (LG-03, F-73)", () => {
  it("posts through the adapter, returns the record the server made, and the card can open it", async () => {
    await useTasksStore.getState().load();
    const like = listed("t5")!;
    const made = await useTaskCardStore.getState().createTask({
      title: "From the goal's card",
      owner: "josh",
      priority: "medium",
      status: "open",
      links: [],
      goalId: "g1",
      labels: like.labels,
      setAt: todayKey(),
      focus: like.focus,
    });
    // online, a created task comes back; offline it is queued and null (A4R6-06)
    if (made == null) throw new Error("createTask answered null online");
    expect(made.id).toBeTruthy();
    expect((await fromServer(made.id)).title).toBe("From the goal's card");
    expect(made.goalId).toBe("g1");

    useTaskCardStore.getState().openTask(made.id);
    await useTaskCardStore.getState().loadDetailTask(made.id);
    expect(useTaskCardStore.getState().detailTask?.id).toBe(made.id);
  });
});

describe("A4R5-05 · the completion's undo takes back only what the completion wrote", () => {
  // The undo PUT the whole snapshot from before the tick, so anything written
  // to the task inside the ten seconds went with it: complete t1 with its
  // subtasks, add "Ship the pack by courier", press Undo — and the new subtask
  // was deleted. `lib/optimistic.ts` rule 4: undo restores what THIS write
  // changed, not the whole record.
  it("a subtask added inside the undo window survives the undo, and the ones the completion closed reopen", async () => {
    const before = await fromServer("t1");
    const open = before.subtasks.filter((s) => !s.done).map((s) => s.id);
    expect(open.length).toBeGreaterThan(0); // else "reopen" proves nothing
    expect(before.status).not.toBe("done");

    await useTaskCardStore.getState().completeTask("t1", true, before);
    expect((await fromServer("t1")).status).toBe("done");

    // inside the window, something else is written to the same task
    await handle({ method: "POST", path: "/tasks/t1/subtasks", body: { title: "Ship the pack by courier", owner: "josh" } });
    await useSessionStore.getState().undoLatest();

    const after = await fromServer("t1");
    expect(after.status).toBe(before.status);
    expect(after.completedAt).toBeUndefined();
    expect(after.subtasks.some((s) => s.title === "Ship the pack by courier")).toBe(true);
    for (const id of open) expect(after.subtasks.find((s) => s.id === id)?.done).toBe(false);
    // and a subtask that was already done before the tick stays done
    for (const s of before.subtasks.filter((x) => x.done)) expect(after.subtasks.find((x) => x.id === s.id)?.done).toBe(true);
  });
});
