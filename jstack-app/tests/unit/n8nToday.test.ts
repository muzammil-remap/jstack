/**
 * Phase 5 — `GET /today` on the n8n build: the composite the mock's `getToday` builds, from the live
 * calendar and tasks, with everything that has no source left at the contract's empty value.
 *
 * Driven through the real transport and the real client, `fetch` answering each webhook with its
 * redacted real reply (B-17: no outbound call), so "one page load runs each workflow once" is
 * counted at the fetch, where a proxy would count it.
 */
import type { Task, TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { contractErrors, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");
type Time = typeof import("@/lib/time");

const page1 = sample("tasks.page1").data as { tasks: { id: string; status: string; position: number; waitingOn: string }[] };
let replies: Record<string, () => { status: number; text: () => Promise<string> }> = {};
let fetched: string[] = [];

function load(): { transport: N8n["n8nTransport"]; time: Time } {
  let loaded!: { transport: N8n["n8nTransport"]; time: Time };
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" }));
    /* eslint-disable @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock */
    loaded = { transport: (require("@/data/transport/n8n") as N8n).n8nTransport, time: require("@/lib/time") as Time };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return loaded;
}

const ok = (data: unknown) => () => ({ status: 200, text: async () => JSON.stringify({ ok: true, data }) });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-02T02:00:00.000Z"), advanceTimers: true });
  fetched = [];
  replies = { calendar: ok(sample("calendar.cases").data), tasks: ok(page1) };
  globalThis.fetch = jest.fn(async (url: string) => {
    const key = String(url).split("/").pop() ?? "";
    fetched.push(key);
    const reply = replies[key];
    return reply != null ? reply() : Promise.reject(new TypeError("Failed to fetch"));
  }) as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

const get = async (transport: N8n["n8nTransport"], path: string, query?: Record<string, string>): Promise<TransportResponse> => transport({ method: "GET", path, query });

describe("Phase 5 · the Today composite from the live sources", () => {
  it("is a valid TodayComposite", async () => {
    const { transport } = load();
    const res = await get(transport, "/today");
    expect(res.status).toBe(200);
    expect(contractErrors(res.json, "/today")).toEqual([]);
  });

  it("its calendar is exactly GET /calendar's today answer — and the two share one webhook call", async () => {
    const { transport, time } = load();
    const today = (await get(transport, "/today")).json as TodayComposite;
    const calendar = (await get(transport, "/calendar", { view: "today", anchor: time.todayKey() })).json;
    expect(today.calendar).toEqual(calendar);
    expect(fetched.filter((k) => k === "calendar")).toHaveLength(1);
  });

  it("its tasks are the first three not done, in Twenty's order", async () => {
    const { transport } = load();
    const today = (await get(transport, "/today")).json as TodayComposite;
    const expected = [...page1.tasks]
      .sort((a, b) => a.position - b.position)
      .filter((t) => t.status !== "DONE")
      .slice(0, 3)
      .map((t) => t.id);
    expect(today.tasks.map((t: Task) => t.id)).toEqual(expected);
    expect(today.tasks.every((t: Task) => t.status !== "done")).toBe(true);
  });

  it("a focus narrows both halves: every task and event is personal, so Work is empty", async () => {
    const { transport } = load();
    const work = (await get(transport, "/today", { focus: "work" })).json as TodayComposite;
    expect({ tasks: work.tasks, events: work.calendar.events }).toEqual({ tasks: [], events: [] });
  });

  it("what has no source says nothing: no cards, no lines, no delta even when asked, the glance and the close at nothing", async () => {
    const { transport } = load();
    const today = (await get(transport, "/today", { since: "2026-10-01T00:00:00.000Z" })).json as TodayComposite;
    expect({ needsYou: today.needsYou, since: today.since, endLine: today.endLine, delta: today.delta, insight: today.insight, glance: today.glance, close: today.close }).toEqual({
      needsYou: [],
      since: "",
      endLine: "",
      delta: undefined,
      insight: undefined,
      glance: { habits: "", people: 0, money: "", goals: 0 },
      close: { habits: [], logs: [] },
    });
  });

  it("one cold load of Today and the calendar grid runs each workflow once", async () => {
    const { transport, time } = load();
    await Promise.all([get(transport, "/today"), get(transport, "/calendar", { view: "today", anchor: time.todayKey() }), get(transport, "/tasks", { view: "list" }), get(transport, "/tasks/waiting")]);
    expect(fetched.sort()).toEqual(["calendar", "tasks"]);
  });
});

describe("Phase 5 · when a source fails, Today says so", () => {
  it("the calendar refused: the composite carries its status", async () => {
    replies.calendar = () => ({ status: 502, text: async () => JSON.stringify({ ok: false, error: { code: "UPSTREAM_ERROR", message: "Google did not answer" } }) });
    const { transport } = load();
    const res = await get(transport, "/today");
    expect(res.status).toBe(502);
  });

  it("the tasks answered in the wrong shape: a 502, not an empty list", async () => {
    replies.tasks = ok({ count: 0 });
    const { transport } = load();
    expect((await get(transport, "/today")).status).toBe(502);
  });

  it("nothing answered: the network's error, for the outbox and the sync dot", async () => {
    replies = {};
    const { transport } = load();
    await expect(get(transport, "/today")).rejects.toThrow("Failed to fetch");
  });
});
