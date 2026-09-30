/**
 * ADR-83 — on the n8n build a locked app gets nothing: every call waits for the unlock, nothing
 * reaches the proxy before it, and then each held call goes out as it was asked — one call per
 * workflow, so the tabs load as they would have. What unlocks, and the emergency lock, go through.
 * The mock is unchanged: it answers under the gate, as it always has.
 *
 * `fetch` stands in for the proxy (B-17: no outbound call), answering each webhook with its redacted
 * real reply, so "nothing reaches the proxy" is counted where the proxy would count it.
 */
import type { TodayComposite } from "@/data/types";
import type { TransportResponse } from "@/data/transport/Transport";
import { contractErrors, sample } from "./n8nContract";

type N8n = typeof import("@/data/transport/n8n");
type Provider = typeof import("@/data/provider");
type Session = typeof import("@/stores/session");

const N8N_CONFIG = { DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" };
const REPLIES: Record<string, string> = {
  calendar: JSON.stringify({ ok: true, data: sample("calendar.cases").data }),
  tasks: JSON.stringify({ ok: true, data: sample("tasks.page1").data }),
};

let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  globalThis.fetch = jest.fn(async (url: string) => {
    const key = String(url).split("/").pop() ?? "";
    fetched.push(key);
    const reply = REPLIES[key];
    return reply != null ? { status: 200, text: async () => reply } : Promise.reject(new TypeError("Failed to fetch"));
  }) as unknown as typeof fetch;
});

/** "answered" if the call has settled within a few ticks, "waiting" if it is still held */
const state = (call: Promise<unknown>): Promise<"answered" | "waiting"> =>
  Promise.race([call.then(() => "answered" as const, () => "answered" as const), new Promise<"waiting">((r) => setTimeout(() => r("waiting"), 60))]);

function load<T>(mod: string, config: Record<string, unknown> | null): T {
  let loaded!: T;
  jest.isolateModules(() => {
    // a doMock outlives the isolated registry it was made in, so the mock's case clears the n8n one
    if (config != null) jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), ...config }));
    else jest.dontMock("@/data/config");
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
    loaded = { mod: require(mod), session: require("@/stores/session") } as T;
  });
  return loaded;
}

describe("ADR-83 · the n8n transport holds every call while the gate is shut", () => {
  function gated() {
    const { mod } = load<{ mod: N8n }>("@/data/transport/n8n", N8N_CONFIG);
    let locked = true;
    const waiting: (() => void)[] = [];
    const gate = { locked: () => locked, opened: () => new Promise<void>((r) => waiting.push(r)) };
    const unlock = () => {
      locked = false;
      waiting.splice(0).forEach((open) => open());
    };
    return { transport: mod.createN8nTransport(() => {}, gate), unlock };
  }

  it("locked: webhook reads, local answers and keyless writes all wait, and nothing reaches the proxy", async () => {
    const { transport } = gated();
    const calls = [
      transport({ method: "GET", path: "/today" }),
      transport({ method: "GET", path: "/tasks", query: { view: "list" } }),
      transport({ method: "GET", path: "/calendar", query: { view: "today" } }),
      transport({ method: "GET", path: "/focuses" }),
      transport({ method: "GET", path: "/session" }),
      transport({ method: "POST", path: "/brain/dump", body: { text: "x" } }),
    ];
    expect(await Promise.all(calls.map(state))).toEqual(["waiting", "waiting", "waiting", "waiting", "waiting", "waiting"]);
    expect(fetched).toEqual([]);
  });

  it("what unlocks, and the emergency lock, go through while locked", async () => {
    const { transport } = gated();
    expect((await transport({ method: "GET", path: "/auth/nonce" })).status).toBe(200);
    expect((await transport({ method: "POST", path: "/lock", body: {} })).status).toBe(501);
    expect(fetched).toEqual([]);
  });

  it("unlocked: every held call is answered, and each workflow runs once", async () => {
    const { transport, unlock } = gated();
    const calls: Promise<TransportResponse>[] = [
      transport({ method: "GET", path: "/today" }),
      transport({ method: "GET", path: "/tasks", query: { view: "list" } }),
      transport({ method: "GET", path: "/tasks/waiting" }),
      transport({ method: "GET", path: "/focuses" }),
    ];
    await state(Promise.all(calls));
    expect(fetched).toEqual([]);
    unlock();
    const answers = await Promise.all(calls);
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200]);
    expect(contractErrors(answers[0].json, "/today")).toEqual([]);
    expect([...fetched].sort()).toEqual(["calendar", "tasks"]);
  });
});

describe("ADR-83 · through the provider, on the session's own gate", () => {
  it("the session opens locked: Today waits with nothing sent; unlock() answers it, one call per workflow; a relock holds the next", async () => {
    const { mod: provider, session } = load<{ mod: Provider; session: Session }>("@/data/provider", N8N_CONFIG);
    expect(session.useSessionStore.getState().locked).toBe(true);
    const today = provider.getAdapter().getToday();
    expect(await state(today)).toBe("waiting");
    expect(fetched).toEqual([]);

    session.useSessionStore.getState().unlock();
    const composite: TodayComposite = await today;
    expect(composite.todayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...fetched].sort()).toEqual(["calendar", "tasks"]);

    session.useSessionStore.getState().relock();
    const again = provider.getAdapter().getCapabilities();
    expect(await state(again)).toBe("waiting");
    session.useSessionStore.getState().unlock();
    await expect(again).resolves.toBeDefined();
  });

  it("the mock is unchanged: it answers under the gate, as before", async () => {
    const { mod: provider, session } = load<{ mod: Provider; session: Session }>("@/data/provider", null);
    expect(session.useSessionStore.getState().locked).toBe(true);
    expect(await state(provider.getAdapter().getToday())).toBe("answered");
    expect(fetched).toEqual([]);
  });
});
