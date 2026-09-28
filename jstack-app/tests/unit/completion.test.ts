/**
 * TK-10..TK-13 — finishing a task, and what that means for its parts (T-3,
 * ADR-42).
 *
 * Completing used to be `PATCH { status: "done" }`, which said nothing about
 * the three subtasks still open underneath it. The rule ADR-42 adds is not
 * really about cascading: it is about ASKING. A tick on a task with open
 * subtasks is genuinely ambiguous, and the server refuses to guess — hence
 * `includeSubtasks` on the request and a `422` when it is missing.
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import tasksFixture from "@/data/mock/fixtures/tasks.json";
import { EMPTY_FILTERS } from "@/data/taskFilters";
import { dayKey } from "@/lib/time";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import type { Task } from "@/data/types";

const task = async (id: string): Promise<Task> => (await handle({ method: "GET", path: `/tasks/${id}` })).json as Task;
const complete = (id: string, includeSubtasks: boolean) => handle({ method: "POST", path: `/tasks/${id}/complete`, body: { includeSubtasks } });

describe("TK-10 · the server does not guess", () => {
  beforeEach(() => db.reset());

  it("refuses to complete a task with open subtasks unless it was asked to", async () => {
    const before = await task("t1");
    expect(before.subtasks.some((s) => !s.done)).toBe(true);

    const res = await complete("t1", false);
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "includeSubtasks" });
    // the reason carries the COUNT, which is what the confirm dialog asks about
    expect((res.json as { reason: string }).reason).toMatch(/\d+ subtask/);
    expect((await task("t1")).status).not.toBe("done");
  });

  it("with the answer, it completes the task and every open subtask at ONE instant", async () => {
    const wereOpen = (await task("t1")).subtasks.filter((s) => !s.done).map((s) => s.id);
    const res = await complete("t1", true);
    expect(res.status).toBe(200);

    const after = await task("t1");
    expect(after.status).toBe("done");
    expect(after.completedAt).toBeTruthy();
    expect(after.completedBy).toBe("josh");
    expect(after.subtasks.every((s) => s.done)).toBe(true);
    // One decision, one instant — not six timestamps a fraction apart. Only
    // the subtasks THIS call closed: one was already done in the fixture and
    // carries no stamp, which is correct (nobody recorded when).
    const closedNow = after.subtasks.filter((s) => wereOpen.includes(s.id)).map((s) => s.completedAt);
    expect(new Set([after.completedAt, ...closedNow]).size).toBe(1);
  });

  it("one activity entry, not one per subtask", async () => {
    const before = (await task("t1")).activity.length;
    await complete("t1", true);
    const after = await task("t1");
    expect(after.activity.length).toBe(before + 1);
    expect(after.activity.at(-1)).toMatchObject({ actor: "josh", text: "Completed" });
  });

  it("a task with nothing open completes without being asked", async () => {
    // t5 has no subtasks at all
    const res = await complete("t5", false);
    expect(res.status).toBe(200);
    expect((await task("t5")).status).toBe("done");
  });
});

describe("TK-10/TK-11 · the store's tick", () => {
  beforeEach(async () => {
    db.reset();
    useSessionStore.setState({ toast: null, undo: { entries: [] }, modal: null, modalPayload: undefined });
    await useTasksStore.getState().load();
  });

  const listed = (id: string) => useTasksStore.getState().list.find((t) => t.id === id);

  it("a task with open subtasks ASKS — and completes nothing until it is answered", async () => {
    const t1 = listed("t1")!;
    await useTaskCardStore.getState().requestComplete(t1);
    expect(useSessionStore.getState().modal).toBe("complete-confirm");
    expect(useSessionStore.getState().modalPayload).toBe("t1");
    expect((await task("t1")).status).not.toBe("done");
  });

  it("a task with none completes straight away", async () => {
    // t5 is open, in the default list view, and has no subtasks
    const t5 = listed("t5")!;
    expect(t5.subtasks).toHaveLength(0);
    await useTaskCardStore.getState().requestComplete(t5);
    expect(useSessionStore.getState().modal).toBeNull();
    expect((await task("t5")).status).toBe("done");
  });

  it("undo reverses the task AND the subtasks it closed", async () => {
    const before = await task("t1");
    const openBefore = before.subtasks.filter((s) => !s.done).map((s) => s.id);
    expect(openBefore.length).toBeGreaterThan(0);

    await useTaskCardStore.getState().completeTask("t1", true, before);
    expect((await task("t1")).status).toBe("done");

    await useSessionStore.getState().undoLatest();
    const after = await task("t1");
    expect(after.status).toBe(before.status);
    // every subtask that was open is open again — a completion that could not
    // be taken back in one move would be worse than one that asked twice
    expect(after.subtasks.filter((s) => !s.done).map((s) => s.id)).toEqual(openBefore);
  });

  it("ticking a DONE task reopens it", async () => {
    await useTaskCardStore.getState().completeTask("t5", false, useTasksStore.getState().list.find((t) => t.id === "t5")!);
    await useTasksStore.getState().setView("done");
    const done = useTasksStore.getState().list.find((t) => t.id === "t5")!;
    expect(done.status).toBe("done");

    await useTaskCardStore.getState().requestComplete(done);
    expect((await task("t5")).status).toBe("open");
  });
});

describe("TK-12 · the EA's own completion", () => {
  it("day 2 carries completedBy so the card can name who finished it", () => {
    db.reset(0, "day2");
    const t1 = db.get().tasks.find((t) => t.id === "t1");
    expect(t1?.completedBy).toBe("ea");
    db.reset();
  });
});

/**
 * G-1, PLANNER_ORDERS #2 — the completion stamp on DAY ONE, not only on day 2.
 *
 * The gap survived T-3, T-5, F-1 and B-1 because nothing failed while it was
 * there: `t9` and `t10` are the only seeded done tasks and neither was stamped,
 * so `TaskDetail`'s TK-12 line (guarded on `completedAt != null`) was never
 * once seen on seeded data, and `predicates.ts`'s `inWindow` — which measures
 * the Done view's range on `completedAt` — matched nothing. F-1 defaulting Done
 * to `all` is the only reason that read as a working screen instead of a bug:
 * the one window that asks no question of `completedAt` was the one window
 * anybody looked through.
 *
 * Two guards, because there are two failures. The first is the invariant (a
 * done task says when and by whom); the second is the consequence a person
 * would actually have hit, and it is the one that was RED before the fixture
 * was stamped — a narrowed Done range returned an empty list.
 */
describe("TK-12 · a finished task says when and by whom, on seeded data too (G-1)", () => {
  it("every done task in the fixture is stamped — the field a kind carries, asserted for every member", () => {
    const done = (tasksFixture as { id: string; status: string; completedAt?: string; completedBy?: string }[]).filter((t) => t.status === "done");
    // a guard that passes on an empty set is a guard that has stopped watching
    expect(done.length).toBeGreaterThan(0);
    for (const t of done) {
      expect({ id: t.id, completedAt: typeof t.completedAt, completedBy: typeof t.completedBy }).toEqual({ id: t.id, completedAt: "string", completedBy: "string" });
    }
  });

  it("the stamps resolve to real instants and real owners, not to the token text", () => {
    const owners = ["josh", "joce", "ea", "dev"];
    for (const t of db.get().tasks.filter((x) => x.status === "done")) {
      expect(Number.isNaN(Date.parse(t.completedAt ?? ""))).toBe(false);
      expect(owners).toContain(t.completedBy);
    }
  });

  it("a narrowed range on Done returns the completed tasks — it returned none", async () => {
    const filters = JSON.stringify({ ...EMPTY_FILTERS, range: { preset: "last" } });
    const res = await handle({ method: "GET", path: "/tasks", query: { view: "done", filters } });
    const ids = (res.json as Task[]).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["t9", "t10"]));
  });

  it("and the range still SELECTS: a window that ends before they finished excludes them", async () => {
    // the pair to the case above. Without this, "returns the completed tasks"
    // would also pass on a `inWindow` that had stopped filtering Done at all,
    // which is the failure one drawer down from the one being fixed.
    const yesterday = dayKey(new Date(db.now().getTime() - 86_400_000));
    const filters = JSON.stringify({ ...EMPTY_FILTERS, range: { preset: "custom", from: dayKey(db.now()), to: dayKey(db.now()) } });
    const res = await handle({ method: "GET", path: "/tasks", query: { view: "done", filters } });
    const ids = (res.json as Task[]).map((t) => t.id);
    expect(ids).not.toContain("t9");
    expect(yesterday < dayKey(db.now())).toBe(true);
  });
});
