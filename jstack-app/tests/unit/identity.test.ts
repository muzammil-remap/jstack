/**
 * ID-01..05, MU-01..04 — who is holding this session, and what that changes
 * (I-1).
 *
 * The load-bearing claim is MU-02, and it is a claim about the SERVER: as
 * Joce, a record in `personal:josh` does not come back. Every test here that
 * matters therefore asks the mock server, not a component — a client-side
 * filter is a rendering choice, and rendering choices can be forgotten one
 * surface at a time. The filter lives in `data/mock/util.ts`'s `inFocus`,
 * which is the single point all sixteen list reads already pass through.
 */
import { asUser, get as dbGet, reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { useSessionStore } from "@/stores/session";
import type { Session, Task, TodayComposite } from "@/data/types";
import type { TransportRequest } from "@/data/transport/Transport";

const call = (method: TransportRequest["method"], path: string, query?: Record<string, string>, body?: unknown) =>
  handle({ method, path, query, body });

const jsonOf = async <T,>(method: TransportRequest["method"], path: string, query?: Record<string, string>) =>
  (await call(method, path, query)).json as T;

/** Every silo named by any record in a response, however deeply nested. */
function silosIn(value: unknown, into: string[] = [], depth = 0): string[] {
  if (value == null || depth > 5) return into;
  if (Array.isArray(value)) {
    for (const item of value) silosIn(item, into, depth + 1);
    return into;
  }
  if (typeof value !== "object") return into;
  const labels = (value as { labels?: { silo?: string } }).labels;
  if (typeof labels?.silo === "string") into.push(labels.silo);
  for (const nested of Object.values(value as Record<string, unknown>)) silosIn(nested, into, depth + 1);
  return into;
}

beforeEach(() => {
  reset();
  useSessionStore.setState({ user: null, silos: [], locked: true, emergency: false });
});

describe("ID-01 · GET /session names the holder, the silos and the token life", () => {
  it("returns user, silos and tokenTtlSeconds: 900", async () => {
    const session = await jsonOf<Session>("GET", "/session");
    expect(session.user).toEqual({ id: "josh", name: "Josh", role: "owner" });
    expect(session.silos).toEqual(["personal:josh", "family1", "family2", "work"]);
    expect(session.tokenTtlSeconds).toBe(900);
    expect(session.device).toBeDefined();
    expect(Array.isArray(session.devices)).toBe(true);
  });

  it("the session store carries the user after unlock", async () => {
    useSessionStore.getState().unlock();
    // unlock fires the load without waiting on it
    await useSessionStore.getState().loadSession();
    expect(useSessionStore.getState().user?.name).toBe("Josh");
    expect(useSessionStore.getState().silos).toContain("personal:josh");
    expect(useSessionStore.getState().tokenTtlSeconds).toBe(900);
  });
});

describe("MU-01 · the rig can hold the session as somebody else", () => {
  it("asUser(\"joce\") reseeds the session with her silos", async () => {
    const result = await call("POST", "/__test__/user", undefined, { id: "joce" });
    expect(result.status).toBe(200);
    const session = await jsonOf<Session>("GET", "/session");
    expect(session.user).toEqual({ id: "joce", name: "Joce", role: "partner" });
    expect(session.silos).toEqual(["personal:joce", "family1"]);
  });

  it("an unknown user is refused rather than silently becoming nobody", async () => {
    const result = await call("POST", "/__test__/user", undefined, { id: "mallory" });
    expect(result.status).toBe(404);
    // and the session is unchanged
    expect((await jsonOf<Session>("GET", "/session")).user.id).toBe("josh");
  });

  it("the rig route is mock-only — it is not in the route table", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { ROUTES } = require("@/data/routes") as typeof import("@/data/routes");
    expect(ROUTES.some((r) => r.path.startsWith("/__"))).toBe(false);
  });
});

describe("MU-02 · as Joce, no record from Josh's personal silo comes back", () => {
  beforeEach(async () => {
    await call("POST", "/__test__/user", undefined, { id: "joce" });
  });

  it("Josh's own fixtures prove the test is not vacuous", async () => {
    // as Josh, personal:josh records DO come back — so their absence below is
    // the filter working, not an empty fixture set
    await call("POST", "/__test__/user", undefined, { id: "josh" });
    const today = await jsonOf<TodayComposite>("GET", "/today");
    const tasks = await jsonOf<Task[]>("GET", "/tasks");
    expect([...silosIn(today), ...silosIn(tasks)]).toContain("personal:josh");
  });

  it.each([
    ["Today", "/today"],
    ["Tasks", "/tasks"],
    ["Brain", "/brain/latest"],
    ["Life", "/life"],
    ["Calendar", "/calendar"],
    ["Decisions", "/actions"],
  ])("%s carries nothing from personal:josh", async (_name, path) => {
    const silos = silosIn(await jsonOf<unknown>("GET", path));
    expect(silos).not.toContain("personal:josh");
    // and nothing outside her own silos at all
    expect(silos.filter((s) => s !== "personal:joce" && s !== "family1")).toEqual([]);
  });

  it("she still sees the family silo — the gate filters, it does not empty", async () => {
    const silos = silosIn(await jsonOf<Task[]>("GET", "/tasks"));
    expect(silos).toContain("family1");
  });
});

describe("MU-03 · the owner tag is relative to whoever is holding the session", () => {
  it("a task owned by the other person is not mine; my own is", async () => {
    const joces = dbGet().tasks.find((t) => t.owner === "joce");
    expect(joces).toBeDefined();

    useSessionStore.setState({ user: { id: "josh", name: "Josh", role: "owner" } });
    expect(useSessionStore.getState().isMine(joces!.owner)).toBe(false);

    asUser("joce");
    useSessionStore.setState({ user: { id: "joce", name: "Joce", role: "partner" } });
    expect(useSessionStore.getState().isMine(joces!.owner)).toBe(true);
  });
});

describe("MU-04 · a focus resolves to silos server-side", () => {
  it("?focus=family returns only family records", async () => {
    const silos = silosIn(await jsonOf<Task[]>("GET", "/tasks", { focus: "family" }));
    expect(silos.length).toBeGreaterThan(0);
    expect([...new Set(silos)]).toEqual(["family1"]);
  });

  it("the focus is resolved from the server's own focus table, not from a string on the record", async () => {
    // proof that it is the SILO being matched: rewrite one record's focus
    // string to nonsense and it still comes back under ?focus=family,
    // because its silo is still family1
    const task = dbGet().tasks.find((t) => t.labels.silo === "family1");
    expect(task).toBeDefined();
    task!.focus = "not-a-focus";
    const ids = (await jsonOf<Task[]>("GET", "/tasks", { focus: "family" })).map((t) => t.id);
    expect(ids).toContain(task!.id);
  });

  it("?focus=work is empty for Joce — she has no work silo", async () => {
    await call("POST", "/__test__/user", undefined, { id: "joce" });
    expect(await jsonOf<Task[]>("GET", "/tasks", { focus: "work" })).toEqual([]);
  });
});

describe("ID-03 · httpTransport refuses to run on a cleartext origin", () => {
  /**
   * `fetch` is replaced for the whole block, and that is not tidiness — the
   * first cut of this test let the real one run against a hostname that does
   * not exist. Locally DNS said no immediately and the suite passed in
   * milliseconds; on the ubuntu runner the same call sat there, and the board
   * hung in the Jest step for ten minutes before it was cancelled (B-17).
   *
   * A unit test must not put a packet on the network. It also makes the
   * assertion sharper: the guard's job is to refuse BEFORE the request is
   * made, so "was fetch called at all" is the thing worth checking.
   */
  const realFetch = globalThis.fetch;
  let fetched: string[];

  beforeEach(() => {
    fetched = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete (globalThis as { location?: unknown }).location;
    jest.dontMock("@/data/config");
    jest.resetModules();
  });

  function transportOn(protocol: string, hostname: string) {
    (globalThis as { location?: unknown }).location = { protocol, hostname };
    jest.resetModules();
    jest.doMock("@/data/config", () => ({
      API_BASE_URL: "https://api.example.test",
      API_TIMEOUT_MS: 15_000,
      UPLOAD_TIMEOUT_MS: 60_000,
      API_CREDENTIALS: "same-origin",
      AUTH: { getToken: async () => null },
      USE_API_ADAPTER: true,
    }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    return (require("@/data/transport/http") as typeof import("@/data/transport/http")).httpTransport;
  }

  it("refuses an http:// origin, with the honest reason, before it sends anything", async () => {
    const transport = transportOn("http:", "jstack.example.com");
    await expect(transport({ method: "GET", path: "/today" })).rejects.toMatchObject({
      status: 0,
      reason: "insecure origin",
    });
    expect(fetched).toEqual([]);
  });

  it("allows loopback, which is where it is developed", async () => {
    const transport = transportOn("http:", "localhost");
    await expect(transport({ method: "GET", path: "/today" })).resolves.toMatchObject({ status: 200 });
    expect(fetched).toEqual(["https://api.example.test/today"]);
  });

  it("allows https", async () => {
    const transport = transportOn("https:", "jstack.example.com");
    await expect(transport({ method: "GET", path: "/today" })).resolves.toMatchObject({ status: 200 });
    expect(fetched).toEqual(["https://api.example.test/today"]);
  });
});

describe("ID-04 · a reused refresh token locks the device", () => {
  /**
   * Everything is required together, from ONE module graph. The ID-03 block
   * above calls `jest.resetModules()`, so a later `require` builds a fresh
   * copy of every module it touches — including a second `useSessionStore`.
   * Asserting on the file-level import while the code under test wrote to
   * that second copy fails with the store looking untouched, which reads
   * exactly like the lock never happening.
   */
  function freshGraph() {
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const mockSession = require("@/data/mock/handlers/session") as typeof import("@/data/mock/handlers/session");
    const tokens = require("@/lib/authTokens") as typeof import("@/lib/authTokens");
    const store = (require("@/stores/session") as typeof import("@/stores/session")).useSessionStore;
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { ...mockSession, ...tokens, store };
  }

  afterEach(async () => {
    reset();
    // a successful refresh schedules the next one fourteen minutes out; the
    // timer is unref'd now, but a test that leaves credentials behind is
    // untidy regardless (B-17)
    const { clearTokens } = freshGraph();
    await clearTokens();
  });

  it("401 { reason: \"reuse\" } locks into the emergency state", async () => {
    const { armRefreshReuse, refreshAccessToken, store } = freshGraph();
    store.setState({ locked: false, emergency: false });
    armRefreshReuse();

    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 401, reason: "reuse" });
    expect(store.getState().locked).toBe(true);
    expect(store.getState().emergency).toBe(true);
  });

  it("an ordinary refresh does not lock anything — a flat network is not a break-in", async () => {
    const { refreshAccessToken, store } = freshGraph();
    store.setState({ locked: false, emergency: false });
    await refreshAccessToken();
    expect(store.getState().locked).toBe(false);
    expect(store.getState().emergency).toBe(false);
  });
});

describe("ID-05 · SECURITY.md states the identity limit and the demo rule", () => {
  /** Prose wraps; compare the sentence, not the line breaks. */
  const securityText = () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(join(__dirname, "..", "..", "..", "SECURITY.md"), "utf8").replace(/\s+/g, " ");
  };

  it("the demo rule", () => {
    expect(securityText()).toContain("the shared demo must never point at a real backend");
  });

  it("the identity limit", () => {
    expect(securityText()).toContain("A passkey binds a device, not a person");
  });
});
