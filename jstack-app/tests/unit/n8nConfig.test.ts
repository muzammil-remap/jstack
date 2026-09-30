/**
 * ADR-76 — `EXPO_PUBLIC_DATA_SOURCE` chooses the server, the mock stays the default, and on n8n the
 * provider really routes through the n8n transport: configuration answered on the device, a write
 * with no key refused as `501`, and nothing from the mock's fixtures.
 */
type Config = typeof import("@/data/config");

const VARS = ["EXPO_PUBLIC_DATA_SOURCE", "EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_USE_API_ADAPTER", "EXPO_PUBLIC_N8N_BASE_URL", "EXPO_PUBLIC_TWENTY_APP_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

function config(env: Partial<Record<(typeof VARS)[number], string>> = {}): Config {
  Object.assign(process.env, env);
  let c!: Config;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- re-read with this test's environment
    c = require("@/data/config") as Config;
  });
  return c;
}

describe("ADR-76 · DATA_SOURCE", () => {
  it("unset is the mock, and every existing test runs on it", () => {
    expect({ source: config().DATA_SOURCE, api: config().USE_API_ADAPTER }).toEqual({ source: "mock", api: false });
  });

  it("n8n is a real build: USE_API_ADAPTER is on, so no mock sign-in and no demo watermark", () => {
    const c = config({ EXPO_PUBLIC_DATA_SOURCE: "n8n" });
    expect({ source: c.DATA_SOURCE, api: c.USE_API_ADAPTER, base: c.API_BASE_URL }).toEqual({ source: "n8n", api: true, base: null });
  });

  it("the older switches still mean http, and an explicit value wins over them", () => {
    expect(config({ EXPO_PUBLIC_API_BASE_URL: "https://api.example.test/api/v1" }).DATA_SOURCE).toBe("http");
    expect(config({ EXPO_PUBLIC_USE_API_ADAPTER: "1" }).DATA_SOURCE).toBe("http");
    expect(config({ EXPO_PUBLIC_API_BASE_URL: "https://api.example.test", EXPO_PUBLIC_DATA_SOURCE: "mock" }).DATA_SOURCE).toBe("mock");
  });

  it("an unknown value is not a fourth source", () => {
    expect(config({ EXPO_PUBLIC_DATA_SOURCE: "N8N" }).DATA_SOURCE).toBe("mock");
  });
});

describe("ADR-76 · the n8n settings", () => {
  it("default to the production proxy prefix and no Twenty link", () => {
    const c = config();
    expect({ base: c.N8N_BASE_URL, twenty: c.TWENTY_APP_URL }).toEqual({ base: "/n8n", twenty: "" });
  });

  it("take the environment's values, without a trailing slash", () => {
    const c = config({ EXPO_PUBLIC_N8N_BASE_URL: "http://127.0.0.1:8787/n8n/", EXPO_PUBLIC_TWENTY_APP_URL: "https://twenty.example/" });
    expect({ base: c.N8N_BASE_URL, twenty: c.TWENTY_APP_URL }).toEqual({ base: "http://127.0.0.1:8787/n8n", twenty: "https://twenty.example" });
  });

});

describe("ADR-76 · the provider on n8n", () => {
  type Provider = typeof import("@/data/provider");
  type Adapter = typeof import("@/data/ApiAdapter");

  function n8nProvider(): { provider: Provider; adapter: Adapter } {
    let provider!: Provider;
    let adapter!: Adapter;
    jest.isolateModules(() => {
      jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock
      provider = require("@/data/provider") as Provider;
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same registry's ContractError
      adapter = require("@/data/ApiAdapter") as Adapter;
      // the session opens locked, and a locked session writes nothing (CD-14) — past the gate, to reach the transport
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same registry's session store
      (require("@/stores/session") as typeof import("@/stores/session")).useSessionStore.setState({ locked: false });
    });
    return { provider, adapter };
  }

  it("answers from the n8n transport, not the mock: the fixture tasks and Needs-you cards are absent", async () => {
    // tasks (Phase 4) and the calendar (Phase 3) are live: each answers its real empty reply, nothing else goes out
    const { sample } = jest.requireActual("./n8nContract");
    const replies: Record<string, string> = { tasks: JSON.stringify(sample("tasks.empty")), calendar: JSON.stringify(sample("calendar.empty")) };
    const fetchSpy = jest.fn(async (url: string) => {
      const key = String(url).split("/").pop() ?? "";
      return replies[key] != null ? { status: 200, text: async () => replies[key] } : Promise.reject(new Error("unit test: no network"));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const { provider } = n8nProvider();
    const a = provider.getAdapter();
    await expect(a.getTasks({})).resolves.toEqual([]);
    const today = await a.getToday();
    expect({ needsYou: today.needsYou, tasks: today.tasks, events: today.calendar.events }).toEqual({ needsYou: [], tasks: [], events: [] });
    expect((await a.getSession()).user).toEqual({ id: "josh", name: "Josh", role: "owner" });
    // one call per webhook: Today's tasks shared the list's call (the 30-second sharing)
    expect(fetchSpy.mock.calls.map(([url]) => String(url).split("/").pop())).toEqual(["tasks", "calendar"]);
  });

  it("a write with no key is refused with the contract's error, and nothing is queued or sent", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const { provider, adapter } = n8nProvider();
    const error = await provider
      .getAdapter()
      .postJournal({ text: "a line", source: "typed" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(adapter.ContractError);
    expect((error as InstanceType<Adapter["ContractError"]>).status).toBe(501);
    expect(await provider.getOutbox().entries()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the voice socket is not the mock's scripted conversation: it closes at once", async () => {
    const { provider } = n8nProvider();
    const socket = provider.getVoiceSocket();
    const closed = new Promise<void>((resolve) => socket.onClose(resolve));
    const opened = jest.fn();
    socket.onOpen(opened);
    await closed;
    expect(opened).not.toHaveBeenCalled();
  });
});
