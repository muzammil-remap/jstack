/**
 * Phase 6 · `records` (ADR-87) — the configuration and the Life records from the append-only
 * records store, with the mock's rules and the contract's statuses.
 *
 * Reads of the same key share one answer for 30 seconds (`data/n8n/client.ts`), and a write drops
 * them, so each case seeds the store before it first reads it. 08:00 UTC is the same day, 30 Sep, in
 * both board zones.
 *
 * `fetch` answers `records` from an in-memory store that keeps the workflow's own rules (Decide in
 * `remap/n8n/JSTACK-DASH-records.json`): a put appends version N+1, an `expectedVersion` that is not
 * the latest is `409`, `list` answers the latest of each key under a prefix. The real replies
 * (`tests/fixtures/n8n/records.*`, REMAP's `dashtest-p6/` keys) prove each shape is read as sent.
 */
import type { ActionItem, AppLayout, AutonomyRule, Goal, Habit, HabitStats, Layout, LifeComposite, NotificationGroup, Parameter, SectionConfig, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { contractErrors, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");
type Row = { key: string; version: number; value: unknown };

let rows: Row[] = [];
let sent: Record<string, unknown>[] = [];
/** a reply for the next records request instead of the store's own, once */
let next: { status: number; body: unknown } | null = null;

const latest = (key: string) => rows.filter((r) => r.key === key).sort((a, b) => b.version - a.version)[0];
function store(body: Record<string, unknown>): { status: number; body: unknown } {
  const op = body.op;
  const key = String(body.key ?? "");
  if (op === "get") {
    const r = latest(key);
    return { status: 200, body: { ok: true, data: r ? { key, version: r.version, value: r.value, savedAt: "2026-09-30T08:00:00.000Z", savedBy: "josh" } : { key, version: 0, value: null, savedAt: null, savedBy: null } } };
  }
  if (op === "put") {
    const current = latest(key)?.version ?? 0;
    if (body.expectedVersion != null && body.expectedVersion !== current) return { status: 409, body: sample("records.error.409-conflict") };
    rows.push({ key, version: current + 1, value: body.value });
    return { status: 200, body: { ok: true, data: { key, version: current + 1, value: body.value, savedAt: "2026-09-30T08:00:00.000Z", savedBy: "josh" } } };
  }
  if (op === "list") {
    const prefix = String(body.prefix);
    const keys = [...new Set(rows.filter((r) => r.key.startsWith(prefix)).map((r) => r.key))].sort();
    return { status: 200, body: { ok: true, data: { prefix, items: keys.map((k) => ({ key: k, version: latest(k).version, value: latest(k).value })), truncated: false } } };
  }
  return { status: 400, body: sample("records.error.400-validation") };
}
const seed = (key: string, value: unknown) => rows.push({ key, version: (latest(key)?.version ?? 0) + 1, value });

function load(config: Record<string, unknown> = {}): N8n["n8nTransport"] {
  let transport!: N8n["n8nTransport"];
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n", ...config }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
    transport = (require("@/data/transport/n8n") as N8n).n8nTransport;
  });
  return transport;
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-09-30T08:00:00.000Z"), advanceTimers: true });
  rows = [];
  sent = [];
  next = null;
  globalThis.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    const key = String(url).split("/").pop() ?? "";
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    if (key === "records") sent.push(Object.fromEntries(Object.entries(body).filter(([k]) => k !== "request_id")));
    const reply = key !== "records" ? replyFor(key) : next ?? store(body);
    if (key === "records") next = null;
    return { status: reply.status, text: async () => JSON.stringify(reply.body) };
  }) as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

/** the other keys a composite reads: each its real empty reply */
const replyFor = (key: string) => ({ status: 200, body: sample(key === "calendar" ? "calendar.empty" : key === "tasks" ? "tasks.empty" : "actions.empty") });

const get = (t: N8n["n8nTransport"], path: string, query?: Record<string, string>) => t({ method: "GET", path, query });
const put = (t: N8n["n8nTransport"], path: string, body: unknown): Promise<TransportResponse> => t({ method: "PUT", path, body });
const post = (t: N8n["n8nTransport"], path: string, body?: unknown): Promise<TransportResponse> => t({ method: "POST", path, body });
const puts = () => sent.filter((b) => b.op === "put");

describe("records · the store's real replies are read as sent", () => {
  it("an absent key, a present one, a stale put and a bad key", async () => {
    next = { status: 200, body: sample("records.get-absent") };
    const absent = await get(load(), "/settings/quiet-hours");
    expect(contractErrors(absent.json, "/settings/quiet-hours")).toEqual([]);
    next = { status: 200, body: sample("records.get-present") };
    expect((await get(load(), "/settings/quiet-hours")).json).toEqual((sample("records.get-present").data as { value: unknown }).value);
    // the race the version is for: read here, saved meanwhile on another device, then saved here —
    // the read is still the shared one, so the write carries version 0 and the store refuses it
    const t = load();
    await get(t, "/settings/quiet-hours");
    seed("settings:quietHours", { start: "21:00", end: "07:00", exceptions: [] });
    expect((await put(t, "/settings/quiet-hours", absent.json)).status).toBe(409);
    next = { status: 400, body: sample("records.error.400-validation") };
    expect((await get(load(), "/settings/voice")).status).toBe(422);
  });

  it("a reply that is not a record is this section's 502", async () => {
    next = { status: 200, body: { ok: true, data: { key: "x" } } };
    expect((await get(load(), "/settings/voice")).status).toBe(502);
  });
});

describe("records · the settings: the default until saved, then the record", () => {
  it.each([
    ["/settings/quiet-hours", "settings:quietHours"],
    ["/settings/autonomy", "settings:autonomy"],
    ["/settings/voice", "settings:voice"],
    ["/focuses", "focuses"],
    ["/layout/app", "layout:app"],
    ["/parameters", "parameters"],
    ["/slicers", "slicers"],
  ])("GET %s: the build's default, valid, read from %s", async (path, key) => {
    const res = await get(load(), path);
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, path)).toEqual([]);
    expect(sent).toEqual([{ op: "get", key }]);
  });

  it("a save sends the version it read, and a later read answers the saved record", async () => {
    const t = load();
    const quiet = (await get(t, "/settings/quiet-hours")).json as Record<string, unknown>;
    const saved = await put(t, "/settings/quiet-hours", { ...quiet, start: "22:00" });
    expect({ status: saved.status, start: (saved.json as { start: string }).start }).toEqual({ status: 200, start: "22:00" });
    expect(puts()).toEqual([{ op: "put", key: "settings:quietHours", value: { ...quiet, start: "22:00" }, expectedVersion: 0, savedBy: "josh" }]);
    expect(((await get(t, "/settings/quiet-hours")).json as { start: string }).start).toBe("22:00");
    await put(t, "/settings/quiet-hours", { ...quiet, start: "21:00" });
    expect(puts()[1].expectedVersion).toBe(1);
  });

  it("the namespace, when set, is in front of every key — REMAP's test runs", async () => {
    const t = load({ N8N_RECORDS_NAMESPACE: "dashtest-p6" });
    await put(t, "/settings/voice", (await get(t, "/settings/voice")).json);
    // the read, then the write (its version read is the read's shared answer)
    expect(sent.map((b) => `${b.op} ${b.key}`)).toEqual(["get dashtest-p6/settings:voice", "put dashtest-p6/settings:voice"]);
  });

  it("focuses and rules are saved from the bodies the app sends; a rule the mock refuses is refused", async () => {
    const t = load();
    const focuses = (await get(t, "/focuses")).json as unknown[];
    expect((await put(t, "/focuses", { focuses: focuses.slice(0, 2) })).json).toEqual(focuses.slice(0, 2));
    const rule: AutonomyRule = { id: "r1", text: "ask before bills", scope: "bill", mode: "ask", on: true, addedBy: "josh", addedAt: "2026-09-30T00:00:00.000Z" };
    expect((await put(t, "/settings/autonomy/rules", { rules: [rule] })).json).toEqual({ rules: [rule] });
    expect(await put(t, "/settings/autonomy/rules", { rules: [{ ...rule, scope: "nothing" }] })).toEqual({ status: 422, json: { reason: "no such scope", field: "scope" } });
    expect(await put(t, "/settings/autonomy/rules", { rules: [rule, rule] })).toEqual({ status: 422, json: { reason: "two rules share the id r1", field: "rules" } });
  });

  it("the app layout is merged over what is there", async () => {
    const t = load();
    const before = (await get(t, "/layout/app")).json as AppLayout;
    expect((await put(t, "/layout/app", { showFocusRow: !before.showFocusRow })).json).toEqual({ ...before, showFocusRow: !before.showFocusRow });
  });

  it("a tab layout: a pinned section cannot be hidden (422, nothing saved); a save is Josh's; revert is the tab's own arrangement", async () => {
    const t = load();
    const layout = (await get(t, "/layout/today")).json as Layout;
    expect(contractErrors(layout, "/layout/{tab}")).toEqual([]);
    expect(await put(t, "/layout/today", { hidden: ["needs"] })).toEqual({ status: 422, json: { reason: "cannot hide pinned section(s): needs", field: "hidden" } });
    expect(puts()).toEqual([]);
    const reordered = (await put(t, "/layout/today", { order: [...layout.order].reverse() })).json as Layout;
    expect({ order: reordered.order, managedBy: reordered.managedBy }).toEqual({ order: [...layout.order].reverse(), managedBy: "josh" });
    const reverted = (await post(t, "/layout/today/revert")).json as Layout;
    expect(reverted.order).toEqual(layout.order);
    expect((await get(t, "/layout/nowhere")).status).toBe(404);
  });

  it("a parameter: 404 unknown, 422 outside its range (the mock's words), else saved", async () => {
    const t = load();
    const params = (await get(t, "/parameters")).json as Parameter[];
    const lock = params.find((p) => p.key === "lock.afterMinutes")!;
    expect((await put(t, "/parameters/no.such", { value: 1 })).status).toBe(404);
    expect(await put(t, "/parameters/lock.afterMinutes", { value: 0 })).toEqual({ status: 422, json: { reason: `${lock.label} must be between ${lock.min} and ${lock.max} ${lock.unit}`, field: "value" } });
    const saved = await put(t, "/parameters/lock.afterMinutes", { value: lock.min! + 1 });
    expect({ status: saved.status, value: (saved.json as Parameter).value }).toEqual({ status: 200, value: lock.min! + 1 });
    expect(contractErrors(saved.json, "/parameters/{key}", "PUT")).toEqual([]);
  });

  it("a notification group: none until Josh has one; unknown 404, a locked one 423, else its devices merged", async () => {
    expect((await get(load(), "/settings/notifications")).json).toEqual([]);
    const t = load();
    const groups: NotificationGroup[] = [
      { id: "security", name: "Security", locked: true, devices: { iphone: true, ipad: true, pc: true, telegram: true } } as NotificationGroup,
      { id: "needs", name: "Needs you", devices: { iphone: true, ipad: false, pc: true, telegram: false } } as NotificationGroup,
    ];
    seed("settings:notificationGroups", groups);
    expect((await put(t, "/settings/notifications/nope", { devices: {} })).status).toBe(404);
    expect((await put(t, "/settings/notifications/security", { devices: { pc: false } })).status).toBe(423);
    expect(((await put(t, "/settings/notifications/needs", { devices: { ipad: true } })).json as NotificationGroup).devices).toEqual({ iphone: true, ipad: true, pc: true, telegram: false });
  });
});

describe("records · the Life records: goals, habits, a day's log, the stats", () => {
  const goal = (id: string, status: Goal["status"], silo = "personal:josh"): Goal =>
    ({ id, area: "Health", text: `goal ${id}`, status, history: [], taskIds: [], deliverableIds: [], labels: { silo, types: [], setBy: "content" }, setAt: "2026-09-01", focus: "personal" }) as Goal;
  const habit = (id: string, archived = false, sort = 1): Habit => ({ id, name: `habit ${id}`, sort, archived });

  it("goals: active in focus; one left out is dropped with a history line; the history newest first; the mock's refusals", async () => {
    expect((await get(load(), "/goals")).json).toEqual([]);
    const t = load();
    seed("goals", [goal("g1", "active"), goal("g2", "behind")]);
    const kept = await put(t, "/goals", { goals: [goal("g1", "active")] });
    expect((kept.json as Goal[]).map((g) => g.id)).toEqual(["g1"]);
    const history = (await get(t, "/goals/history")).json as Goal[];
    expect(history.map((g) => [g.id, g.status, g.history.at(-1)?.event])).toEqual([["g2", "dropped", "dropped"]]);
    expect(await put(t, "/goals", { goals: [{ ...goal("g3", "active"), text: " " }] })).toEqual({ status: 422, json: { reason: "every goal needs an id and a title", field: "goals" } });
    expect(await put(t, "/goals", { goals: [goal("g4", "active", "personal:joce")] })).toEqual({ status: 403, json: { reason: "a new goal is filed in one of your own silos", field: "labels.silo" } });
    const one = await get(t, "/goals/g1");
    expect({ status: one.status, goal: (one.json as { goal: Goal }).goal.id }).toEqual({ status: 200, goal: "g1" });
    expect((await get(t, "/goals/nope")).status).toBe(404);
  });

  it("habits: none can be removed, only archived; archived ones are listed only when asked", async () => {
    const t = load();
    seed("habits", [habit("h1"), habit("h2")]);
    expect(await put(t, "/habits", { habits: [habit("h1")] })).toEqual({ status: 422, json: { reason: "habit h2 cannot be removed — archive it instead, and it keeps its history", field: "habits" } });
    const listed = await put(t, "/habits", { habits: [habit("h1"), { ...habit("h2"), archived: true }] });
    expect((listed.json as Habit[]).map((h) => h.id)).toEqual(["h1"]);
    expect(((await get(t, "/habits", { includeArchived: "true" })).json as Habit[]).map((h) => [h.id, h.archived])).toEqual([["h1", false], ["h2", true]]);
  });

  it("a day's log is one key, date first; the stats count the week from the logs, streaks included", async () => {
    const t = load();
    seed("habits", [habit("h1")]);
    for (const day of ["2026-09-27", "2026-09-28", "2026-09-29"]) seed(`habitlog:${day}:h1`, { done: true });
    const logged = await post(t, "/habits/h1/log", { date: "2026-09-30", done: true });
    expect(logged.json).toEqual({ habitId: "h1", date: "2026-09-30", done: true });
    expect(puts().at(-1)).toMatchObject({ key: "habitlog:2026-09-30:h1", value: { done: true } });
    const stats = (await get(t, "/habits/stats", { period: "week" })).json as HabitStats;
    expect(contractErrors(stats, "/habits/stats")).toEqual([]);
    const [row] = stats.habits;
    expect({ done: row.done, possible: row.possible, streak: row.streak, earliest: stats.earliest }).toEqual({ done: 4, possible: 7, streak: { current: 4, longest: 4 }, earliest: "2026-09-27" });
  });

  it("Today's close-the-day and glance, and Life, come from the same records", async () => {
    const t = load();
    seed("habits", [habit("h1"), habit("h2", false, 2)]);
    seed("goals", [goal("g1", "behind"), goal("g2", "active")]);
    seed("habitlog:2026-09-30:h1", { done: true });
    seed("habitlog:2026-09-30:gone", { done: true }); // a log of a habit no longer tracked is not counted
    const today = (await get(t, "/today")).json as TodayComposite;
    expect(contractErrors(today, "/today")).toEqual([]);
    expect({ glance: today.glance, chips: today.close.habits.map((h) => h.id), logs: today.close.logs.filter((l) => l.habitId !== "gone") }).toEqual({
      glance: { habits: "1/2", people: 0, money: "", goals: 1 },
      chips: ["h1", "h2"],
      logs: [{ habitId: "h1", date: "2026-09-30", done: true }],
    });
    const life = (await get(t, "/life")).json as LifeComposite;
    expect(contractErrors(life, "/life")).toEqual([]);
    expect({ goals: life.goals.map((g) => g.id), habits: life.habits.map((h) => h.id), logs: life.habitLogs.length }).toEqual({ goals: ["g1", "g2"], habits: ["h1", "h2"], logs: 2 }); // every log of the day, as the mock keeps them
  });
});

describe("records · sections and a card's draft", () => {
  it("a section's edit is validated and kept over its default; revert is the default again", async () => {
    const t = load();
    const [first] = (await get(t, "/sections")).json as SectionConfig[];
    const edited = await put(t, `/sections/${first.id}`, { title: "Renamed" });
    expect({ status: edited.status, title: (edited.json as SectionConfig).title, managedBy: (edited.json as SectionConfig).managedBy }).toEqual({ status: 200, title: "Renamed", managedBy: "josh" });
    expect(((await get(t, "/sections")).json as SectionConfig[]).find((s) => s.id === first.id)?.title).toBe("Renamed");
    expect(((await post(t, `/sections/${first.id}/revert`)).json as SectionConfig).title).toBe(first.title);
    expect((await put(t, "/sections/nope", { title: "x" })).status).toBe(404);
  });

  it("a revised email draft is kept beside the card, and the answer is the card with it", async () => {
    const card = (sample("actions.get").data as { item: ActionItem }).item;
    const inner = globalThis.fetch as jest.Mock;
    globalThis.fetch = jest.fn(async (url: string, init?: { body?: string }) =>
      String(url).endsWith("/actions") ? { status: 200, text: async () => JSON.stringify(sample("actions.get")) } : inner(url, init),
    ) as unknown as typeof fetch;
    const res = await put(load(), `/actions/${card.id}/draft`, { subject: "Re: x", body: "Hi — shorter." });
    expect({ status: res.status, quote: (res.json as ActionItem).quote }).toEqual({ status: 200, quote: "Hi — shorter." });
    expect(puts()).toEqual([{ op: "put", key: `draft:${card.id}`, value: { subject: "Re: x", body: "Hi — shorter." }, expectedVersion: 0, savedBy: "josh" }]);
  });
});
