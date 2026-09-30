/**
 * Phase 4 — the Tasks routes from Twenty through the `tasks` webhook: the paging loop, the map from
 * a Twenty record to the contract's `Task` (each Checkpoint 2 answer, and each switch off and on),
 * and the mock's list rules, against the redacted real replies in `tests/fixtures/n8n/`.
 *
 * `callWebhook` is stubbed (B-17); a module is loaded fresh wherever a switch in `data/config.ts`
 * changes. `due` is a local day key, so the one zone-dependent case carries a literal per board zone.
 */
import type { Column, Task, WaitingRow } from "@/data/types";
import type { Asked } from "@/data/n8n/registry";
import { contractErrors, sample } from "./n8nContract";

type Adapter = typeof import("@/data/n8n/adapters/tasks");
type Meta = typeof import("@/lib/taskMeta");

const page1 = sample("tasks.page1").data as { tasks: Record<string, unknown>[]; pageInfo: Record<string, unknown> };
const emptyPage = sample("tasks.empty").data;
const ask = (query: Record<string, string | undefined> = {}, params: string[] = []): Asked => ({ req: { method: "GET", path: "/tasks", query }, params });

/** a Twenty record in the sample's exact shape, with only what a case needs changed */
const record = (over: Record<string, unknown>) => ({ ...page1.tasks[0], ...over });
const pageOf = (tasks: unknown[], next: string | null = null) => ({ count: tasks.length, totalCount: tasks.length, pageInfo: { startCursor: null, endCursor: next, hasNextPage: next != null, hasPreviousPage: false }, tasks });

let calls: { key: string; body: Record<string, unknown> }[] = [];
let answer: (body: Record<string, unknown>) => unknown = () => page1;

function load(config: Record<string, unknown> = {}): { adapter: Adapter; meta: Meta } {
  let loaded!: { adapter: Adapter; meta: Meta };
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, TASK_PRIORITY_KNOWN: config.TWENTY_PRIORITY_FIELD === true, ...config }));
    jest.doMock("@/data/n8n/client", () => ({
      ...jest.requireActual("@/data/n8n/client"),
      callWebhook: jest.fn(async (key: string, body: Record<string, unknown>) => {
        calls.push({ key, body });
        return answer(body);
      }),
    }));
    /* eslint-disable @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its mocks */
    loaded = { adapter: require("@/data/n8n/adapters/tasks") as Adapter, meta: require("@/lib/taskMeta") as Meta };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return loaded;
}

const listOf = async (a: Adapter, query: Record<string, string | undefined> = {}) => (await a.tasksAnswers.list(ask(query))).json as Task[];
/** every date: the default range (the next 90 days, on List, Board and Gantt alike) would make a case depend on today */
const ALL = JSON.stringify({ range: { preset: "all" } });

beforeEach(() => {
  calls = [];
  answer = () => page1;
});
afterEach(() => jest.useRealTimers());

describe("Phase 4 · the real replies are the contract's", () => {
  it("the page's 29 records: List, Board and Done are valid TaskLists, and together hold every task once", async () => {
    const { adapter } = load();
    const list = await listOf(adapter, { view: "list", filters: ALL });
    const board = await listOf(adapter, { view: "board", filters: ALL });
    const done = await listOf(adapter, { view: "done" });
    for (const json of [list, board, done]) expect(contractErrors(json, "/tasks")).toEqual([]);
    expect(done.every((t) => t.status === "done")).toBe(true);
    expect(list.some((t) => t.status === "done")).toBe(false);
    expect(new Set([...list, ...done].map((t) => t.id)).size).toBe(29);
  });

  it("a task by id is a valid Task; an id Twenty does not hold is 404", async () => {
    const { adapter } = load();
    const id = page1.tasks[3].id as string;
    const found = await adapter.tasksAnswers.byId(ask({}, [id]));
    expect(found.status).toBe(200);
    expect(contractErrors(found.json, "/tasks/{id}")).toEqual([]);
    expect((await adapter.tasksAnswers.byId(ask({}, ["no-such-task"]))).status).toBe(404);
  });

  it("the waiting rows and the columns are valid too", async () => {
    const { adapter } = load();
    expect(contractErrors((await adapter.tasksAnswers.waiting(ask())).json, "/tasks/waiting")).toEqual([]);
    expect(contractErrors((await adapter.tasksAnswers.columns()).json, "/tasks/columns")).toEqual([]);
  });

  it("the empty reply: nothing, and still valid", async () => {
    answer = () => emptyPage;
    const { adapter } = load();
    expect(await listOf(adapter)).toEqual([]);
    expect((await adapter.tasksAnswers.waiting(ask())).json).toEqual([]);
  });
});

describe("Phase 4 · paging", () => {
  it("follows the cursor until hasNextPage is false, one call per page, 60 at a time", async () => {
    answer = (body) => (body.cursor == null ? pageOf([record({ id: "p1" })], "c1") : body.cursor === "c1" ? pageOf([record({ id: "p2" })], "c2") : pageOf([record({ id: "p3" })]));
    const { adapter } = load();
    expect((await listOf(adapter, { view: "board" })).map((t) => t.id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(calls.map((c) => c.body)).toEqual([{ limit: 60 }, { limit: 60, cursor: "c1" }, { limit: 60, cursor: "c2" }]);
  });

  it("stops at ten pages and says so once", async () => {
    let n = 0;
    answer = () => pageOf([record({ id: `p${++n}` })], `c${n}`);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { adapter } = load();
    expect((await listOf(adapter, { view: "board" })).length).toBe(10);
    await listOf(adapter, { view: "board" });
    expect(calls.length).toBe(20);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/stopped after 10 pages/);
    warn.mockRestore();
  });
});

describe("Phase 4 · the map, one answer at a time", () => {
  const one = async (over: Record<string, unknown>, config: Record<string, unknown> = {}) => {
    answer = () => pageOf([record({ id: "t", ...over })]);
    const { adapter, meta } = load(config);
    return { task: (await adapter.tasksAnswers.byId(ask({}, ["t"]))).json as Task, meta };
  };

  it.each([
    ["TODO", "", "open"],
    ["IN_PROGRESS", "", "in_progress"],
    ["DONE", "", "done"],
    ["TODO", "Person A", "waiting"],
    ["IN_PROGRESS", "Person A", "waiting"],
    ["DONE", "Person A", "done"],
  ])("status %s with waitingOn %j → %s", async (status, waitingOn, expected) => {
    expect((await one({ status, waitingOn })).task.status).toBe(expected);
  });

  it("a status Twenty adds later is open, with one warning naming it", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect((await one({ status: "BLOCKED", waitingOn: "" })).task.status).toBe("open");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"BLOCKED"'));
    warn.mockRestore();
  });

  it("owner is josh: nobody assigned, an unknown member, and a task OpenClaw filed alike", async () => {
    expect((await one({ assigneeId: null })).task.owner).toBe("josh");
    expect((await one({ assigneeId: "00000000-0000-4000-8000-00000000abcd" })).task.owner).toBe("josh");
    expect((await one({ createdBy: { source: "AGENT", workspaceMemberId: null, name: "openclaw-agent", context: null } })).task.owner).toBe("josh");
  });

  it("priority switch off: a value is sent (the contract needs one) and none is printed", async () => {
    const { task, meta } = await one({ priority: "HIGH" });
    expect(task.priority).toBe("medium");
    expect(meta.taskMetaLine(task)).not.toMatch(/priority/);
    expect(meta.taskMetaRuns(task).every((r) => !r.accent)).toBe(true);
  });

  it("priority switch on: Twenty's SELECT is mapped and printed", async () => {
    const { task, meta } = await one({ priority: "HIGH" }, { TWENTY_PRIORITY_FIELD: true });
    expect(task.priority).toBe("high");
    expect(meta.taskMetaLine(task)).toMatch(/high priority/);
    expect((await one({ priority: "LOW" }, { TWENTY_PRIORITY_FIELD: true })).task.priority).toBe("low");
  });

  it("area switch off: every task is personal; on, Twenty's SELECT sets silo and focus", async () => {
    const off = (await one({ area: "WORK" })).task;
    expect({ silo: off.labels.silo, focus: off.focus }).toEqual({ silo: "personal:josh", focus: "personal" });
    const on = (await one({ area: "FAMILY" }, { TWENTY_AREA_FIELD: true })).task;
    expect({ silo: on.labels.silo, focus: on.focus }).toEqual({ silo: "family1", focus: "family" });
    const unknown = (await one({ area: "SIDE" }, { TWENTY_AREA_FIELD: true })).task;
    expect(unknown.labels.silo).toBe("personal:josh");
  });

  it("due is the local day of dueAt — a day key, as every reader of `due` expects", async () => {
    const DUE: Record<string, string> = { "Australia/Brisbane": "2026-10-01", "America/New_York": "2026-09-30" };
    const expected = DUE[process.env.TZ ?? ""];
    if (expected == null) return;
    expect((await one({ dueAt: "2026-09-30T20:00:00.000Z" })).task.due).toBe(expected);
    expect((await one({ dueAt: null })).task.due).toBeUndefined();
  });

  it("no completion time: the contract makes it optional and Twenty holds none", async () => {
    const done = (await one({ status: "DONE" })).task;
    expect(done.completedAt).toBeUndefined();
    expect(done.completedBy).toBeUndefined();
  });

  it("links: none without TWENTY_APP_URL; with it, the record's page in Twenty", async () => {
    expect((await one({})).task.links).toEqual([]);
    const linked = (await one({}, { TWENTY_APP_URL: "https://twenty.example" })).task;
    expect(linked.links).toEqual([{ label: "Twenty", url: "https://twenty.example/object/task/t" }]);
    expect(linked.twentyUrl).toBe("https://twenty.example/object/task/t");
  });

  it("the rest: Twenty as the source, no subtasks or activity composed, setAt from updatedAt", async () => {
    const { task } = await one({ updatedAt: "2026-09-23T11:19:45.876Z" });
    expect({ metaParts: task.metaParts, subtasks: task.subtasks, activity: task.activity, setAt: task.setAt, labels: task.labels }).toEqual({
      metaParts: { source: "Twenty" },
      subtasks: [],
      activity: [],
      setAt: "2026-09-23T11:19:45.876Z",
      labels: { silo: "personal:josh", types: [], setBy: "source" },
    });
  });
});

describe("Phase 4 · waiting and the Board", () => {
  it("a waiting task is a waiting row: who is waitingOn, what is the title, days since Twenty filed it", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    answer = () => pageOf([record({ id: "w", title: "Task W", status: "TODO", waitingOn: " Person A ", createdAt: "2026-09-27T00:00:00.000Z" }), record({ id: "d", status: "DONE", waitingOn: "Person B" })]);
    const { adapter } = load();
    const rows = (await adapter.tasksAnswers.waiting(ask())).json as WaitingRow[];
    expect(rows).toEqual([{ who: "Person A", what: "Task W", days: 3, taskId: "w" }]);
  });

  it("the sample's two waiting tasks are both in Waiting on, and on their Task", async () => {
    const { adapter } = load();
    const rows = (await adapter.tasksAnswers.waiting(ask())).json as WaitingRow[];
    expect(rows.map((r) => r.who).sort()).toEqual(["Person A", "Person B"]);
    const list = await listOf(adapter, { view: "board", filters: ALL });
    expect(list.filter((t) => t.status === "waiting").length).toBe(2);
  });

  it("columns mirror bucket's values, the done one last; status decides done-ness when the two disagree", async () => {
    const { adapter } = load();
    const columns = (await adapter.tasksAnswers.columns()).json as Column[];
    expect(columns.map((c) => ({ id: c.id, name: c.name, statuses: c.statuses, order: c.order }))).toEqual([
      { id: "bucket-INBOX", name: "Inbox", statuses: ["open", "in_progress", "waiting"], order: 1 },
      { id: "bucket-DONE", name: "Done", statuses: ["done"], order: 2 },
    ]);
    const board = await listOf(adapter, { view: "board", filters: ALL });
    // two tasks are DONE in Twenty but still in the INBOX bucket: they are done, in the done column
    const doneTasks = board.filter((t) => t.status === "done");
    expect(doneTasks.length).toBe(23);
    expect(doneTasks.every((t) => t.column === "bucket-DONE")).toBe(true);
    expect(board.filter((t) => t.status !== "done").every((t) => t.column === "bucket-INBOX")).toBe(true);
  });

  it("with no bucket on any task, the default columns — no task falls off the Board", async () => {
    answer = () => pageOf([record({ id: "a", bucket: null })]);
    const { adapter } = load();
    expect(((await adapter.tasksAnswers.columns()).json as Column[]).map((c) => c.id)).toEqual(["col-now", "col-next", "col-in-progress", "col-waiting", "col-done"]);
  });
});

describe("Phase 4 · the mock's list rules (data/mock/handlers/tasks.ts)", () => {
  it("focus by silo: every task is personal until the area field exists", async () => {
    const { adapter } = load();
    expect((await listOf(adapter, { view: "board", focus: "work", filters: ALL })).length).toBe(0);
    expect((await listOf(adapter, { view: "board", focus: "personal", filters: ALL })).length).toBe(29);
  });

  it("a slicer narrows: Waiting keeps the waiting tasks", async () => {
    const { adapter } = load();
    const waiting = await listOf(adapter, { view: "list", slice: "waiting" });
    expect(waiting.length).toBe(2);
    expect(waiting.every((t) => t.status === "waiting")).toBe(true);
  });

  it("the default range is the next 90 days — on the Board as on the List: undated tasks stay, a task due before today does not", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-30T02:00:00.000Z"));
    answer = () => pageOf([record({ id: "undated", status: "TODO", dueAt: null, waitingOn: "" }), record({ id: "overdue", status: "TODO", dueAt: "2026-09-10T02:00:00.000Z", waitingOn: "" }), record({ id: "soon", status: "TODO", dueAt: "2026-10-10T02:00:00.000Z", waitingOn: "" })]);
    const { adapter } = load();
    expect((await listOf(adapter, { view: "list" })).map((t) => t.id)).toEqual(["undated", "soon"]);
    expect((await listOf(adapter, { view: "board" })).map((t) => t.id)).toEqual(["undated", "soon"]);
  });

  it("search by title, and filters by status", async () => {
    answer = () => pageOf([record({ id: "a", title: "Call the bank", status: "TODO", waitingOn: "" }), record({ id: "b", title: "Book review", status: "TODO", waitingOn: "Person A" })]);
    const { adapter } = load();
    expect((await listOf(adapter, { view: "list", q: "bank" })).map((t) => t.id)).toEqual(["a"]);
    expect((await listOf(adapter, { view: "list", filters: JSON.stringify({ status: ["waiting"] }) })).map((t) => t.id)).toEqual(["b"]);
  });

  it("the list is in Twenty's position order", async () => {
    answer = () => pageOf([record({ id: "second", position: -2, status: "TODO", waitingOn: "" }), record({ id: "first", position: -5, status: "TODO", waitingOn: "" })]);
    const { adapter } = load();
    expect((await listOf(adapter, { view: "board" })).map((t) => t.id)).toEqual(["first", "second"]);
  });
});

describe("Phase 4 · anything else is this section's 502", () => {
  it.each([
    ["no tasks list", { count: 0 }],
    ["a task without an id", pageOf([record({ id: undefined })])],
    ["a status that is not text", pageOf([record({ status: 3 })])],
    ["a dueAt that is not a date", pageOf([record({ dueAt: "friday" })])],
    ["a waitingOn that is not text", pageOf([record({ waitingOn: 5 })])],
  ])("%s", async (_label, data) => {
    answer = () => data;
    const { adapter } = load();
    const res = await adapter.tasksAnswers.list(ask());
    expect(res.status).toBe(502);
    expect((res.json as { reason: string }).reason).toMatch(/^Twenty's tasks answered in an unexpected shape/);
  });
});
