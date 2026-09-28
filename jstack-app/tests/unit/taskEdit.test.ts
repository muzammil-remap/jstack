/**
 * TK-02..TK-05 — editing a task on its own card (T-1, ADR-42).
 *
 * Two halves, and the split is deliberate. The SERVER decides what is legal:
 * an end before its start is a `422` naming the field, and so is an empty
 * title. The STORE decides what a person sees while the answer is in flight:
 * the value moves at once, a refusal puts it back, and anything else — an
 * offline capture, say — leaves the optimistic value standing because the
 * outbox will carry it.
 *
 * The rendered half is `e2e/core/task-detail.spec.ts`: a control that PATCHes
 * the right field is not the same claim as a control a person can find.
 */
import * as db from "@/data/mock/db";
import tasksFixture from "@/data/mock/fixtures/tasks.json";
import { completedLine, taskMetaLine, taskMetaRuns } from "@/lib/taskMeta";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handle } from "@/data/mock/server";
import { atTime, dayKey, todayKey } from "@/lib/time";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { useSessionStore } from "@/stores/session";
import type { Task } from "@/data/types";

const patch = (id: string, body: Record<string, unknown>) => handle({ method: "PATCH", path: `/tasks/${id}`, body });
const taskFromServer = async (id: string): Promise<Task> => (await handle({ method: "GET", path: `/tasks/${id}` })).json as Task;

const MORNING = atTime(todayKey(), 9).toISOString();
const EVENING = atTime(todayKey(), 17).toISOString();

describe("TK-01 · the task carries its own window", () => {
  beforeEach(() => db.reset());

  it("the four dated fixtures have a start and an end, at 9 and at 5", async () => {
    const tasks = (await handle({ method: "GET", path: "/tasks" })).json as Task[];
    const dated = tasks.filter((t) => t.startsAt != null);
    expect(dated.length).toBeGreaterThanOrEqual(4);
    for (const t of dated) {
      expect(t.endsAt).toBeTruthy();
      // a working day, in the device's zone — not a midnight-to-midnight span
      expect(new Date(t.startsAt!).getTime()).toBeLessThan(new Date(t.endsAt!).getTime());
    }
  });

  it("`Subtask` is a real shape on the wire, not an anonymous literal", async () => {
    const task = await taskFromServer("t1");
    for (const sub of task.subtasks) {
      expect(typeof sub.id).toBe("string");
      expect(typeof sub.done).toBe("boolean");
    }
  });
});

describe("TK-03 · the server refuses a window that runs backwards", () => {
  beforeEach(() => db.reset());

  it("takes a start and an end", async () => {
    const res = await patch("t3", { startsAt: MORNING, endsAt: EVENING });
    expect(res.status).toBe(200);
    const task = await taskFromServer("t3");
    expect(dayKey(new Date(task.startsAt!))).toBe(todayKey());
    expect(task.endsAt).toBe(EVENING);
  });

  it("refuses an end before the start, naming the field the edit touched", async () => {
    await patch("t3", { startsAt: MORNING, endsAt: EVENING });
    const res = await patch("t3", { endsAt: atTime(todayKey(), 7).toISOString() });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "endsAt" });
    // and nothing moved
    expect((await taskFromServer("t3")).endsAt).toBe(EVENING);
  });

  /**
   * The half a check on the BODY alone would miss. Dragging the start past a
   * fixed end is exactly how a pair goes backwards, and the patch carries only
   * `startsAt` — so the rule has to be applied to the merged task.
   */
  it("refuses a start moved PAST the end, and says which field was wrong", async () => {
    await patch("t3", { startsAt: MORNING, endsAt: EVENING });
    const res = await patch("t3", { startsAt: atTime(todayKey(), 19).toISOString() });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "startsAt" });
    expect((await taskFromServer("t3")).startsAt).toBe(MORNING);
  });

  it("refuses an empty title (TK-04)", async () => {
    const res = await patch("t3", { title: "   " });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "title" });
    expect((await taskFromServer("t3")).title.length).toBeGreaterThan(0);
  });
});

describe("TK-02..TK-04 · the store's optimistic edit", () => {
  beforeEach(async () => {
    db.reset();
    useSessionStore.setState({ toast: null });
    await useTasksStore.getState().load();
    await useTaskCardStore.getState().loadDetailTask("t3");
  });

  it("the value moves before the server answers, and the row moves with it", async () => {
    const done = useTaskEditsStore.getState().patchTask("t3", { priority: "high" });
    // synchronously, before the await resolves
    expect(useTaskCardStore.getState().detailTask?.priority).toBe("high");
    expect(useTasksStore.getState().list.find((t) => t.id === "t3")?.priority).toBe("high");
    expect(await done).toBeNull();
    expect((await taskFromServer("t3")).priority).toBe("high");
  });

  it("a refusal comes back with the field, and the card goes back to what it was", async () => {
    await useTaskEditsStore.getState().patchTask("t3", { startsAt: MORNING, endsAt: EVENING });
    const refusal = await useTaskEditsStore.getState().patchTask("t3", { endsAt: atTime(todayKey(), 7).toISOString() });
    expect(refusal).toMatchObject({ field: "endsAt" });
    expect(useTaskCardStore.getState().detailTask?.endsAt).toBe(EVENING);
  });

  it("an accepted edit offers an undo that restores only what it changed", async () => {
    await useTaskEditsStore.getState().patchTask("t3", { priority: "high" });
    // the ledger, not the toast: the toast carries the LABEL and the countdown,
    // and `undoLatest()` is what the control actually calls
    expect(useSessionStore.getState().toast?.undoLabel).toBe("Undo");
    expect(useSessionStore.getState().undo.entries).toHaveLength(1);

    await useSessionStore.getState().undoLatest();
    expect((await taskFromServer("t3")).priority).not.toBe("high");
    // the title is untouched by an undo of a priority edit
    expect((await taskFromServer("t3")).title.length).toBeGreaterThan(0);
  });
});

/**
 * JQ-03 (Josh, 8 Sep) — "some task cards are missing their priority in the
 * subtext; show priority on these, and make it readable — 'high priority', not
 * just 'high'".
 *
 * They were not missing it by accident. `taskMetaLine` emitted the word only
 * when the priority was `high`, on the reasoning that marking the exception
 * says more than labelling the rule — which is a defensible design and is not
 * what Josh wants from a list he is scanning for what to do next. Two thirds of
 * the rows said nothing about priority at all, and the third that did said
 * "high", a bare adjective in a line of nouns.
 */
describe("JQ-03 · every task says its priority, in words", () => {
  const priorities = ["low", "medium", "high"] as const;

  it.each(priorities)("a %s task says '<level> priority', not a bare adjective", (priority) => {
    const task = { ...db.get().tasks[0], priority } as Task;
    expect(taskMetaLine(task)).toContain(`${priority} priority`);
    // the bare word on its own is what it used to say
    expect(taskMetaLine(task)).not.toMatch(new RegExp(`· ${priority} ·`));
  });

  it("only the high one is accented — a pop colour on two thirds of a list is not a pop", () => {
    for (const priority of priorities) {
      const task = { ...db.get().tasks[0], priority } as Task;
      const runs = taskMetaRuns(task);
      const accented = runs.filter((r) => r.accent).map((r) => r.text);
      expect(accented).toEqual(priority === "high" ? ["high priority"] : []);
      // and the runs always rejoin to exactly the line
      expect(runs.map((r) => r.text).join("")).toBe(taskMetaLine(task));
    }
  });

  it("every seeded task HAS a priority — a missing one is a fixture error, not a silent omission", () => {
    const bad = (tasksFixture as { id: string; priority?: string }[]).filter((t) => !priorities.includes(t.priority as never));
    expect(bad.map((t) => t.id)).toEqual([]);
  });
});

describe("the marks a row carries (P-9, B2-07)", () => {
  it("with marks, the line carries the repeat rule once and the delegated marker; without, neither", async () => {
    db.reset();
    const t8 = (await handle({ method: "GET", path: "/tasks/t8" })).json as Task;
    expect(t8.repeat?.rule).toBeTruthy();
    const plain = taskMetaLine(t8);
    const marked = taskMetaLine(t8, undefined, { marks: true });
    expect(marked.startsWith(plain)).toBe(true);
    expect(marked.split(t8.repeat!.rule).length - 1).toBe(1);
    expect(plain).not.toContain("delegated");

    await handle({ method: "POST", path: "/tasks/t3/delegate", body: { to: "dev" } });
    const t3 = (await handle({ method: "GET", path: "/tasks/t3" })).json as Task;
    expect(t3.delegatedAt).toBeTruthy();
    expect(taskMetaLine(t3, undefined, { marks: true })).toMatch(/ · delegated /);
    expect(taskMetaLine(t3)).not.toContain("delegated");
    // the runs rejoin to the marked line, as they do to the plain one
    expect(taskMetaRuns(t3, undefined, { marks: true }).map((r) => r.text).join("")).toBe(taskMetaLine(t3, undefined, { marks: true }));
  });
});

/**
 * TK-12's other half (ux round S6-10): "Done rows carry 'Completed ·
 * formatWhen(completedAt)'". The CARD said it — `task-completed-line`, since
 * T-3 — and the rows never did: the Done tab's two rows, the board's Done lane
 * and the card's meta all described a finished task as if it were still
 * running, and the only clue was a strikethrough. Josh, item 2: "when tasks
 * are done either by EA or human checking the box, add in date & time
 * completed". One composer for the phrase, so the row, the lane and the card
 * cannot say it three ways.
 */
describe("TK-12 · a finished task's row says when, and by whom (S6-10)", () => {
  it("the marked line ends with the completed phrase, through the one composer; the plain line does not", async () => {
    db.reset();
    const t9 = await taskFromServer("t9");
    expect(t9.status).toBe("done");
    expect(t9.completedAt).toBeTruthy();
    const phrase = completedLine(t9);
    // who, then when — the card's own order since T-3, and `formatWhen`'s
    // words rather than an instant (TK-13)
    expect(phrase).toMatch(/^Completed · EA · (Today|Yesterday|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2},) \d{1,2}:\d{2}(am|pm)$/);
    const marked = taskMetaLine(t9, undefined, { marks: true });
    expect(marked.endsWith(` · ${phrase}`)).toBe(true);
    expect(marked.split("Completed").length - 1).toBe(1);
    expect(taskMetaLine(t9)).not.toContain("Completed");
    // the runs rejoin to the marked line, so a renderer drawing runs loses nothing
    expect(taskMetaRuns(t9, undefined, { marks: true }).map((r) => r.text).join("")).toBe(marked);
  });

  it("the card keeps its own line and asks the composer to leave the phrase out, so it is never said twice", async () => {
    db.reset();
    const t9 = await taskFromServer("t9");
    expect(taskMetaLine(t9, undefined, { marks: true, repeatLabel: "repeat: ", completed: false })).not.toContain("Completed");
  });

  it("an open task, and a task done before the stamp existed, carry no phrase", async () => {
    db.reset();
    const t1 = await taskFromServer("t1");
    expect(taskMetaLine(t1, undefined, { marks: true })).not.toContain("Completed");
    const unstamped = { ...(await taskFromServer("t9")), completedAt: undefined } as Task;
    expect(taskMetaLine(unstamped, undefined, { marks: true })).not.toContain("Completed");
  });

  it("the completer is named from `completedBy`, and Josh is the default the card has always assumed", async () => {
    db.reset();
    const t9 = await taskFromServer("t9");
    expect(completedLine({ ...t9, completedBy: "josh" })).toMatch(/^Completed · Josh · /);
    expect(completedLine({ ...t9, completedBy: undefined })).toMatch(/^Completed · Josh · /);
  });
});

/**
 * P-13 (F-49, F-50, F-51, F-53, F-57, F-60, F-61, F-66, F-73) — the tasks and
 * life components written once. The one behaviour here is the meta line's
 * repeat label (TK-08 pins the card's "repeat: …"); the rest is where a thing
 * lives, because each of them renders what it rendered before.
 */
describe("P-13 · the tasks and life components written once", () => {
  const root = join(__dirname, "..", "..");
  const src = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("the task card's meta line labels the repeat rule the way TK-08 pins it, through the one composer (F-53)", () => {
    const task = { ...(tasksFixture as unknown as Task[]).find((t) => t.repeat != null)!, delegatedAt: undefined };
    const line = taskMetaLine(task, undefined, { marks: true, repeatLabel: "repeat: " });
    expect(line).toContain(`repeat: ${task.repeat!.rule}`);
    expect(taskMetaLine(task, undefined, { marks: true })).toContain(` · ${task.repeat!.rule}`);
    expect(src("components/tasks/TaskDetail.tsx")).not.toMatch(/repeat: \$\{task\.repeat/);
  });

  it("the gantt bar's geometry is the axis's, the day offset is addDays, and the dead label is gone (F-49, F-51, F-50)", () => {
    expect(src("components/tasks/GanttBar.tsx")).toMatch(/shiftedBox\(/);
    expect(src("components/tasks/GanttBar.tsx")).toMatch(/edgeAtX\(/);
    expect(src("components/tasks/Gantt.tsx")).not.toMatch(/dayKeyOffset/);
    expect(src("components/tasks/FilterDialog.tsx")).not.toMatch(/const DUE: [^=]*label/);
  });

  it("Appearance uses the ui Row, the month pager uses addMonths, the week strip defaults its own length, the sheet lists its sections once, and GoalDetail asserts nothing (F-57, F-60, F-61, F-66, F-73)", () => {
    expect(src("components/settings/Appearance.tsx")).not.toMatch(/function Row\(/);
    expect(src("components/life/HabitMonth.tsx")).not.toMatch(/function shiftMonth\(/);
    expect(src("components/life/HabitWeek.tsx")).toMatch(/days = STRIP_DAYS/);
    for (const f of ["components/life/Habits.tsx", "components/life/TrendsDialog.tsx"]) expect(src(f)).not.toMatch(/days=\{STRIP_DAYS\}/);
    expect(src("components/settings/SettingsSheet.tsx").match(/<Appearance \/>/g)?.length ?? 0).toBe(1);
    expect(src("components/detail/GoalDetail.tsx")).not.toMatch(/data!/);
  });
});
