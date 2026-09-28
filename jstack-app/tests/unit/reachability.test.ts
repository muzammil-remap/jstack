/**
 * A-1 (WP-A, v2.3) — whether the server can be reached, told by the requests
 * themselves, because a phone has nothing else to tell it.
 *
 * `lib/syncInstall.ts` learned the connection from `window`'s `online` and
 * `offline` events and `navigator.onLine`. React Native has none of them, so on
 * the iPhone build a phone in flight mode kept `session.online` true: the sync
 * dot said "ok", every capture tried the dead connection before it queued, and
 * nothing ever moved the flag in either direction. No dependency may be added
 * for it (no NetInfo, no expo-network), and none is needed — every request
 * already says whether it reached anything.
 *
 * Driven through the real provider wiring over HTTP (`USE_API_ADAPTER`), with
 * `fetch` stubbed the way a phone's behaves — React Native's
 * `TypeError("Network request failed")` with the radio off, the mock server's
 * own answer with it on — and with no `window` event target at all, which is
 * what React Native gives the app. A unit test never makes a real network call
 * (CODEMAP §6, B-17).
 */
import type { TransportRequest, TransportResponse } from "@/data/transport/Transport";

const BASE = "https://api.jstack.test";

/** Every request the phone tried, as `METHOD /path`. */
const sent: string[] = [];
let radioOn = true;
let serve: (req: TransportRequest) => Promise<TransportResponse> = async () => ({ status: 500, json: null });
let nextAnswer: TransportResponse | null = null;

/** A phone's `fetch`: it throws with the radio off, and otherwise the server answers. */
async function phoneFetch(url: string, init: { method?: string; body?: unknown } = {}) {
  const u = new URL(url);
  const method = (init.method ?? "GET") as TransportRequest["method"];
  sent.push(`${method} ${u.pathname}`);
  if (!radioOn) throw new TypeError("Network request failed");
  const query: Record<string, string> = {};
  u.searchParams.forEach((v, k) => (query[k] = v));
  const body = typeof init.body === "string" && init.body.length > 0 ? (JSON.parse(init.body) as unknown) : undefined;
  const res = nextAnswer ?? (await serve({ method, path: u.pathname, query, body }));
  nextAnswer = null;
  return { status: res.status, text: async () => (res.json != null ? JSON.stringify(res.json) : "") };
}

/** The app's modules, fresh, wired to HTTP — the build a phone runs at go-live. */
function load() {
  jest.resetModules();
  jest.doMock("@/data/config", () => ({ API_BASE_URL: BASE, AUTH: { getToken: async () => null }, USE_API_ADAPTER: true }));
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { getAdapter, getOutbox } = require("@/data/provider") as typeof import("@/data/provider");
  const { useSessionStore } = require("@/stores/session") as typeof import("@/stores/session");
  const { RETRY_MS, useSyncStore } = require("@/stores/sync") as typeof import("@/stores/sync");
  const { installSync } = require("@/lib/syncInstall") as typeof import("@/lib/syncInstall");
  const { isQueued } = require("@/data/transport/outbox") as typeof import("@/data/transport/outbox");
  const { handle } = require("@/data/mock/server") as typeof import("@/data/mock/server");
  const { reset } = require("@/data/mock/db") as typeof import("@/data/mock/db");
  /* eslint-enable @typescript-eslint/no-require-imports */
  reset();
  serve = (req) => handle(req) as Promise<TransportResponse>;
  // unlocked: the case is the connection, not the lock gate
  useSessionStore.setState({ locked: false, online: true });
  return { getAdapter, getOutbox, useSessionStore, useSyncStore, installSync, isQueued, RETRY_MS, online: () => useSessionStore.getState().online };
}

/** Lets every promise a timer started run to its end — nothing in that chain waits on a clock. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

const g = globalThis as unknown as { fetch?: unknown; addEventListener?: unknown; removeEventListener?: unknown };
const saved = { fetch: g.fetch, add: g.addEventListener, remove: g.removeEventListener };

beforeEach(() => {
  sent.length = 0;
  radioOn = true;
  nextAnswer = null;
  g.fetch = phoneFetch;
  // React Native has no window to fire `online` or `offline` at
  g.addEventListener = undefined;
  g.removeEventListener = undefined;
});

afterEach(() => {
  g.fetch = saved.fetch;
  g.addEventListener = saved.add;
  g.removeEventListener = saved.remove;
  jest.dontMock("@/data/config");
});

describe("A-1 · reachability without a dependency — the transport says whether the server answered", () => {
  it("a request that fails at the network layer takes the session offline, with no window event anywhere", async () => {
    const m = load();
    radioOn = false;
    await expect(m.getAdapter().getToday()).rejects.toThrow("Network request failed");
    expect({ online: m.online() }).toEqual({ online: false });
  });

  it("once it knows, a capture queues at once instead of trying the dead connection first", async () => {
    const m = load();
    radioOn = false;
    await expect(m.getAdapter().getToday()).rejects.toThrow("Network request failed");
    sent.length = 0;
    const res = await m.getAdapter().postBrainDump({ text: "thought of on the plane", source: "typed" });
    expect({ queued: m.isQueued(res), tried: sent }).toEqual({ queued: true, tried: [] });
  });

  it("the next answer brings it back — any answer, because a refusal still had to reach the server", async () => {
    const m = load();
    m.useSessionStore.setState({ online: false }); // where the first case leaves a phone
    await m.getAdapter().getToday();
    expect({ afterOk: m.online() }).toEqual({ afterOk: true });

    m.useSessionStore.setState({ online: false });
    nextAnswer = { status: 503, json: { reason: "a bad minute" } };
    await expect(m.getAdapter().getToday()).rejects.toMatchObject({ status: 503 });
    expect({ after503: m.online() }).toEqual({ after503: true });
  });

  it("an error that is not the network's says nothing about the connection (B-178's class)", async () => {
    const m = load();
    serve = async () => {
      throw new RangeError("a bug in the client");
    };
    await expect(m.getAdapter().getToday()).rejects.toThrow(RangeError);
    expect(m.online()).toBe(true);
  });

  // A-1b: the two timer cases build the app's modules afresh and drive the retry timer, which takes seconds on a
  // loaded machine, so each carries its own budget rather than Jest's 5 s default (red under a full board, green alone)
  const TIMER_CASE_MS = 60_000;

  it("offline with a capture waiting, the 30-second retry asks GET /capabilities, and the answer brings the status and the queue back on their own", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    const m = load();
    const stop = m.installSync();
    try {
      radioOn = false;
      const res = await m.getAdapter().postBrainDump({ text: "thought of on the plane", source: "typed" });
      expect(m.isQueued(res)).toBe(true);
      await m.useSyncStore.getState().refresh();
      // what the failed request leaves behind — the first case proves the transport sets it
      m.useSessionStore.setState({ online: false });

      radioOn = true; // landed, and nobody has touched the app
      sent.length = 0;
      jest.advanceTimersByTime(m.RETRY_MS);
      await settle();

      expect(sent.slice(0, 2)).toEqual(["GET /capabilities", "POST /brain/dump"]);
      expect(m.online()).toBe(true);
      expect(await m.getOutbox().entries()).toEqual([]);
    } finally {
      stop();
      jest.useRealTimers();
    }
  }, TIMER_CASE_MS);

  it("with nothing queued the timer stays quiet — offline alone is not a reason to poll", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    const m = load();
    const stop = m.installSync();
    try {
      m.useSessionStore.setState({ online: false });
      await settle();
      sent.length = 0;
      jest.advanceTimersByTime(m.RETRY_MS * 2);
      await settle();
      expect(sent).toEqual([]);
    } finally {
      stop();
      jest.useRealTimers();
    }
  }, TIMER_CASE_MS);
});
