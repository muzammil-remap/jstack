/**
 * WK-01..WK-04 — the agent working marker (T-5, ADR-42).
 *
 * `work` has been on the wire since T-2, written by `POST /tasks/{id}/delegate`
 * and read by nothing. This row gives it a reader, and the thing worth testing
 * is not the pulse — it is that the marker is a statement about the SERVER's
 * state that four surfaces make identically, and that it goes away by itself
 * when the run ends rather than because somebody reloaded.
 *
 * The pulse and the three surfaces are `e2e/core/tasks.spec.ts`'s half: an
 * animation and a rendered tree are not things a unit test can see.
 */
import { clearServerEventListeners, onServerEvent } from "@/data/mock/events";
import { get as dbGet, reset } from "@/data/mock/db";
import { ROUTES } from "@/data/routes";
import { handle } from "@/data/mock/server";
import { dayKey, formatTime12, todayKey } from "@/lib/time";
import { workLine } from "@/lib/taskMeta";
import type { ServerEvent, Task, Work } from "@/data/types";

const task = (id: string): Task | undefined => dbGet().tasks.find((t) => t.id === id);
const setWork = (taskId: string, state: Work["state"], step?: string) => handle({ method: "POST", path: "/__test__/work", body: { taskId, state, step } });

afterEach(() => clearServerEventListeners());

describe("WK-01 · `work` is on the wire and in the fixtures", () => {
  beforeEach(() => reset());

  it("t2 is running, since 2:14 this morning, with the agent that is doing it", () => {
    const work = task("t2")?.work;
    expect(work).toMatchObject({ agentId: "ea", state: "running" });
    expect(dayKey(new Date(work!.since))).toBe(todayKey());
    expect(formatTime12(new Date(work!.since))).toBe("2:14am");
  });

  it("nothing else claims to be working — a marker on every row is a marker nobody reads", () => {
    const working = dbGet().tasks.filter((t) => t.work != null);
    expect(working.map((t) => t.id)).toEqual(["t2"]);
  });

  it("delegating a task starts one, queued (T-2's write, this row's reader)", async () => {
    await handle({ method: "POST", path: "/tasks/t5/delegate", body: { to: "ea" } });
    expect(task("t5")?.work).toMatchObject({ agentId: "ea", state: "queued" });
  });
});

describe("WK-02 · the line each state puts on screen", () => {
  const at = "2026-09-11T02:14:00.000Z";
  const now = new Date("2026-09-11T09:00:00.000Z");
  const work = (over: Partial<Work> = {}): Work => ({ agentId: "ea", state: "running", since: at, ...over });

  it("running says what it is doing and since when", () => {
    // the SAME day is a time; the marker is about now, and "Today 2:14am" says
    // the word "today" to somebody who is looking at today
    expect(workLine(work(), new Date(at))).toBe(`EA working · since ${formatTime12(new Date(at))}`);
  });

  it("a run that started on another day says which day, because 2:14am alone would be a lie", () => {
    const line = workLine(work({ since: "2026-09-09T02:14:00.000Z" }), now);
    expect(line).toMatch(/^EA working · since /);
    expect(line).not.toBe("EA working · since 2:14am");
  });

  it("queued is not working", () => {
    expect(workLine(work({ state: "queued" }), now)).toBe("EA · queued");
  });

  it("blocked names the step it is stuck on", () => {
    expect(workLine(work({ state: "blocked", step: "waiting on Dropbox" }), now)).toBe("EA · blocked · waiting on Dropbox");
  });

  it("blocked with no step still says blocked rather than trailing a separator", () => {
    expect(workLine(work({ state: "blocked" }), now)).toBe("EA · blocked");
  });

  it("done is no line at all — a finished run belongs in the activity list, not in a marker", () => {
    expect(workLine(work({ state: "done" }), now)).toBeNull();
  });

  it("the agent is named through the one map, not a fourth copy of it", () => {
    expect(workLine(work({ agentId: "dev" }), now)).toMatch(/^Dev /);
  });
});

describe("WK-03 · /__test__/work flips the state and TELLS the app", () => {
  beforeEach(() => reset());

  it("sets the state and emits a `tasks` event naming the task", async () => {
    const seen: ServerEvent[] = [];
    onServerEvent((e) => seen.push(e));

    const res = await setWork("t2", "blocked", "waiting on Dropbox");
    expect(res.status).toBe(200);
    expect(task("t2")?.work).toMatchObject({ state: "blocked", step: "waiting on Dropbox" });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "tasks", ids: ["t2"] });
  });

  it("`since` survives a state change — the run did not start again", async () => {
    const before = task("t2")!.work!.since;
    await setWork("t2", "blocked");
    expect(task("t2")?.work?.since).toBe(before);
  });

  it("`done` clears the marker rather than leaving a done one on screen", async () => {
    await setWork("t2", "done");
    expect(task("t2")?.work).toBeUndefined();
  });

  it("starting work on a task that had none stamps `since` now", async () => {
    expect(task("t5")?.work).toBeUndefined();
    await setWork("t5", "running");
    const work = task("t5")?.work;
    expect(work).toMatchObject({ agentId: "ea", state: "running" });
    expect(dayKey(new Date(work!.since))).toBe(todayKey());
  });

  it("refuses a task it cannot find, and a state that is not one", async () => {
    expect((await setWork("nope", "running")).status).toBe(404);
    expect((await handle({ method: "POST", path: "/__test__/work", body: { taskId: "t2", state: "sprinting" } })).status).toBe(422);
  });

  it("is a RIG route: it is not in the published table, so it can never reach openapi.yaml", () => {
    expect(ROUTES.some((r) => r.path.includes("__test__"))).toBe(false);
  });
});

describe("WK-04 · when the run ends the marker clears and the activity carries it", () => {
  beforeEach(() => reset(0, "day2"));
  afterEach(() => reset());

  it("t2 is not working any more", () => {
    expect(task("t2")?.work).toBeUndefined();
  });

  it("the run it finished is an activity entry that NAMES its usage row", () => {
    const entry = task("t2")?.activity.at(-1);
    expect(entry?.usageId).toBeTruthy();
    const row = dbGet().usage.find((u) => u.id === entry!.usageId);
    expect(row).toMatchObject({ taskId: "t2", agentId: "ea" });
    expect(row!.costAud).toBeGreaterThan(0);
  });

  it("and the task's cost grew by it, because Usage is still the one record (T-4)", () => {
    const spent = dbGet().usage.filter((u) => u.taskId === "t2").reduce((n, u) => n + u.costAud, 0);
    expect(task("t2")?.delegated?.cost).toBeCloseTo(spent, 2);
    // day 1's two rows were $0.40 between them; day 2 adds a third
    expect(spent).toBeGreaterThan(0.4);
  });

  it("the delegation is still running — a run ending is not the task finishing", () => {
    expect(task("t2")?.status).toBe("in_progress");
    expect(task("t2")?.delegated?.state).toBe("running");
  });
});
