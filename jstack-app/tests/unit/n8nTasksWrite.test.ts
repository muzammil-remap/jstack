/**
 * Phase 6 · `tasks-write` — the task writes Twenty's writer can hold (title, status, due date),
 * and a refusal naming the field for everything else, so nothing is half-saved.
 *
 * Driven through the real transport and client, `fetch` answering with the writer's real replies
 * about REMAP's one test task (created and deleted in Phase 6; `tests/fixtures/n8n/tasks-write.*`).
 */
import type { Task } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { contractErrors, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");
type Sent = { key: string; body: Record<string, unknown> };

const update = sample("tasks-write.update").data as { op: string; id: string; task: Record<string, unknown> };
const ID = update.id;
const errorOf = (name: string) => ({ status: Number(/(\d{3})/.exec(name)![1]), body: sample(name) });

let sent: Sent[] = [];
let reply: (s: Sent) => { status: number; body: unknown } = () => ({ status: 200, body: sample("tasks-write.update") });

function load(report?: (online: boolean) => void): N8n["n8nTransport"] {
  let transport!: N8n["n8nTransport"];
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" }));
    /* eslint-disable @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock */
    const n8n = require("@/data/transport/n8n") as N8n;
    /* eslint-enable @typescript-eslint/no-require-imports */
    transport = report != null ? n8n.createN8nTransport(report) : n8n.n8nTransport;
  });
  return transport;
}

beforeEach(() => {
  sent = [];
  reply = () => ({ status: 200, body: sample("tasks-write.update") });
  globalThis.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    const s: Sent = { key: String(url).split("/").pop() ?? "", body: JSON.parse(init?.body ?? "{}") };
    sent.push(s);
    if (s.key === "tasks") return { status: 200, text: async () => JSON.stringify(sample("tasks.page1")) };
    const r = reply(s);
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  }) as unknown as typeof fetch;
});

const call = (t: N8n["n8nTransport"], method: "POST" | "PATCH" | "PUT", path: string, body: unknown): Promise<TransportResponse> => t({ method, path, body });
const bodies = () => sent.filter((s) => s.key === "tasks-write").map((s) => Object.fromEntries(Object.entries(s.body).filter(([k]) => k !== "request_id")));
const withStatus = (status: string) => ({ status: 200, body: { ...sample("tasks-write.update"), data: { ...update, task: { ...update.task, status } } } });

describe("Phase 6 · tasks-write · what Twenty holds is written", () => {
  it("a title: the writer's own words, and the answer is the task as the list maps it, valid", async () => {
    const res = await call(load(), "PATCH", `/tasks/${ID}`, { title: "renamed" });
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, "/tasks/{id}", "PATCH")).toEqual([]);
    expect({ id: (res.json as Task).id, status: (res.json as Task).status, title: (res.json as Task).title }).toEqual({ id: ID, status: "in_progress", title: "dashtest-p6 task (renamed) — REMAP, ignore" });
    expect(bodies()).toEqual([{ op: "update", id: ID, fields: { title: "renamed" } }]);
  });

  it("a due day goes as local noon, so the same day comes back in every zone; cleared, it is null", async () => {
    const NOON: Record<string, string> = { "Australia/Brisbane": "2026-10-04T02:00:00.000Z", "America/New_York": "2026-10-04T16:00:00.000Z" };
    const expected = NOON[process.env.TZ ?? ""];
    if (expected == null) return;
    const t = load();
    await call(t, "PATCH", `/tasks/${ID}`, { due: "2026-10-04" });
    await call(t, "PATCH", `/tasks/${ID}`, { due: undefined, title: "x" });
    await call(t, "PATCH", `/tasks/${ID}`, { due: null });
    expect(bodies().map((b) => b.fields)).toEqual([{ dueAt: expected }, { title: "x" }, { dueAt: null }]);
  });

  it("open, in progress and done are Twenty's TODO, IN_PROGRESS and DONE; the offlineId rides along", async () => {
    const t = load();
    await call(t, "PATCH", `/tasks/${ID}`, { status: "open", offlineId: "o-12345678" });
    await call(t, "PATCH", `/tasks/${ID}`, { status: "in_progress" });
    reply = () => withStatus("DONE");
    const done = await call(t, "POST", `/tasks/${ID}/complete`, { includeSubtasks: true });
    expect(bodies()).toEqual([
      { op: "update", id: ID, fields: { status: "TODO" }, offlineId: "o-12345678" },
      { op: "update", id: ID, fields: { status: "IN_PROGRESS" } },
      { op: "update", id: ID, fields: { status: "DONE" } },
    ]);
    expect(contractErrors(done.json, "/tasks/{id}/complete", "POST")).toEqual([]);
    expect((done.json as Task).status).toBe("done");
  });

  it("the undo of a completion puts back the title, the status and the due day — a waiting task to what Twenty had", async () => {
    const t = load();
    const [first] = (sample("tasks.page1").data as { tasks: { id: string; status: string; title: string }[] }).tasks;
    await t({ method: "GET", path: "/tasks", query: { view: "list" } }); // the list read: Twenty's own statuses
    await call(t, "PUT", `/tasks/${first.id}`, { id: first.id, title: first.title, status: "waiting", due: undefined });
    await call(t, "PUT", `/tasks/${ID}`, { id: ID, title: "back", status: "open" });
    expect(bodies()).toEqual([
      { op: "update", id: first.id, fields: { title: first.title, status: first.status === "IN_PROGRESS" ? "IN_PROGRESS" : "TODO", dueAt: null } },
      { op: "update", id: ID, fields: { title: "back", status: "TODO", dueAt: null } },
    ]);
  });
});

describe("Phase 6 · tasks-write · what Twenty cannot hold is refused, naming it, and nothing is sent", () => {
  it.each([
    ["a Board move between stages", { column: "bucket-INBOX" }, "column", "Twenty's stage can't be set from here yet"],
    ["a Gantt drag", { startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T00:00:00.000Z" }, "startsAt", "Twenty keeps no start date"],
    ["a priority", { priority: "high" }, "priority", "Twenty keeps no priority"],
    ["waiting", { status: "waiting" }, "status", "who it waits on can't be set from here yet"],
    ["a title with a priority", { title: "x", priority: "low" }, "priority", "Twenty keeps no priority"],
  ])("%s: 422 { field, reason }", async (_label, patch, field, reason) => {
    expect(await call(load(), "PATCH", `/tasks/${ID}`, patch)).toEqual({ status: 422, json: { field, reason } });
    expect(bodies()).toEqual([]);
  });

  it("a new task from a goal would lose its goal link: refused; a plain one is created with its own offlineId", async () => {
    const t = load();
    const base = { title: "dashtest", owner: "josh", priority: "medium", status: "open", links: [], labels: { silo: "personal:josh", types: [], setBy: "content" }, setAt: "2026-09-30", focus: "personal" };
    expect(await call(t, "POST", "/tasks", { ...base, goalId: "g1" })).toEqual({ status: 422, json: { field: "goalId", reason: "Twenty keeps no goal link" } });
    expect(await call(t, "POST", "/tasks", { ...base, labels: { ...base.labels, silo: "work" } })).toEqual({ status: 422, json: { field: "labels", reason: "Twenty keeps no area" } });
    expect(bodies()).toEqual([]);
    reply = () => ({ status: 200, body: sample("tasks-write.create") });
    const made = await call(t, "POST", "/tasks", { ...base, due: undefined });
    expect(contractErrors(made.json, "/tasks", "POST")).toEqual([]);
    const [create] = bodies();
    expect({ op: create.op, fields: create.fields }).toEqual({ op: "create", fields: { title: "dashtest", status: "TODO", dueAt: null } });
    expect(String(create.offlineId)).toMatch(/^dash-[A-Za-z0-9-]{8,}$/);
    reply = () => ({ status: 200, body: sample("tasks-write.duplicate") });
    const again = await call(t, "POST", "/tasks", { ...base, offlineId: "dashtest-p6-task-0001" });
    expect({ status: again.status, id: (again.json as Task).id, sentId: bodies()[1].offlineId }).toEqual({ status: 200, id: ID, sentId: "dashtest-p6-task-0001" });
  });

  it("the writer's refusals are the contract's: an unknown task 404, a bad value 422, a reply that is not a task 502", async () => {
    const t = load();
    reply = () => errorOf("tasks-write.error.404-not-found");
    expect((await call(t, "PATCH", "/tasks/nope", { title: "x" })).status).toBe(404);
    reply = () => errorOf("tasks-write.error.400-validation");
    expect((await call(t, "PATCH", `/tasks/${ID}`, { title: "x" })).status).toBe(422);
    reply = () => ({ status: 200, body: { ok: true, data: { op: "update", id: ID, task: null } } });
    expect((await call(t, "PATCH", `/tasks/${ID}`, { title: "x" })).status).toBe(502);
  });
});

describe("Phase 6 · tasks-write · around the writes", () => {
  it("a refusal made on the device says nothing about the connection; a real write says online", async () => {
    const reports: boolean[] = [];
    const t = load((online) => reports.push(online));
    await call(t, "PATCH", `/tasks/${ID}`, { priority: "high" });
    expect(reports).toEqual([]);
    await call(t, "PATCH", `/tasks/${ID}`, { title: "x" });
    expect(reports).toEqual([true]);
  });

  it("after a task write the list is read again — the 30-second sharing does not keep the old one", async () => {
    const t = load();
    const list = () => t({ method: "GET", path: "/tasks", query: { view: "list" } });
    await list();
    await list();
    await call(t, "PATCH", `/tasks/${ID}`, { title: "x" });
    await list();
    expect(sent.map((s) => s.key)).toEqual(["tasks", "tasks-write", "tasks"]);
  });
});
