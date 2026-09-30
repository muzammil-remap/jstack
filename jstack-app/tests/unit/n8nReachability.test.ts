/**
 * ADR-78 — on n8n the connection is told only by what really went out, and a route that is not
 * connected is its section's error, never a lost connection.
 *
 * Most n8n answers are made on the device. Read by `withReachability`, each would say the server
 * answered, and with the proxy down `sync.probe`'s `GET /capabilities` would put the session back
 * online. So the transport reports around `callWebhook` alone: this file proves a local answer and a
 * 501 leave the session's `online` exactly as it was, that a GET is never queued, and that a real
 * webhook call reports `false` on a network failure and `true` on any answer, a refusal included.
 * `fetch` is stubbed throughout (B-17).
 */
type Provider = typeof import("@/data/provider");
type Adapter = typeof import("@/data/ApiAdapter");
type Session = typeof import("@/stores/session");
type Usage = typeof import("@/stores/usage");
type N8n = typeof import("@/data/transport/n8n");

const N8N_CONFIG = { DATA_SOURCE: "n8n", USE_API_ADAPTER: true, API_BASE_URL: null, N8N_BASE_URL: "http://127.0.0.1:9/n8n" };

function onN8n(): { provider: Provider; adapter: Adapter; session: Session; usage: Usage } {
  let loaded!: { provider: Provider; adapter: Adapter; session: Session; usage: Usage };
  jest.isolateModules(() => {
    jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), ...N8N_CONFIG }));
    /* eslint-disable @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its config mock */
    loaded = {
      provider: require("@/data/provider") as Provider,
      adapter: require("@/data/ApiAdapter") as Adapter,
      session: require("@/stores/session") as Session,
      usage: require("@/stores/usage") as Usage,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return loaded;
}

let fetchSpy: jest.Mock;
beforeEach(() => {
  fetchSpy = jest.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

describe("ADR-78 · a route that is not connected is its section's error", () => {
  it("GET /usage answers 501 through the provider, the Usage store keeps nothing, and the session stays online", async () => {
    const { provider, adapter, session, usage } = onN8n();
    session.useSessionStore.setState({ online: true });
    const error = await provider
      .getAdapter()
      .getUsage("month")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(adapter.ContractError);
    expect({ status: (error as InstanceType<Adapter["ContractError"]>).status, reason: (error as InstanceType<Adapter["ContractError"]>).reason }).toEqual({ status: 501, reason: "not connected yet" });
    await expect(usage.useUsageStore.getState().load()).rejects.toBeInstanceOf(adapter.ContractError);
    expect(usage.useUsageStore.getState().summary).toBeNull();
    expect(session.useSessionStore.getState().online).toBe(true);
    expect(await provider.getOutbox().entries()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a local answer says nothing about the connection: offline stays offline, whatever the probe route answers", async () => {
    const { provider, session } = onN8n();
    session.useSessionStore.setState({ online: false });
    const a = provider.getAdapter();
    await a.getCapabilities();
    await a.getSession();
    await a.getUsage("month").catch(() => undefined);
    expect(session.useSessionStore.getState().online).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ADR-78 · a real webhook call reports the connection", () => {
  function withWiredTasks(): N8n {
    let n8n!: N8n;
    jest.isolateModules(() => {
      jest.doMock("@/data/config", () => ({ ...jest.requireActual("@/data/config"), ...N8N_CONFIG }));
      jest.doMock("@/data/n8n/registry", () => {
        const actual = jest.requireActual("@/data/n8n/registry");
        const adapter = { body: () => ({ limit: 1 }), toContract: (data: unknown) => ({ status: 200, json: data }) };
        return { ...actual, READS: { ...actual.READS, getTasks: { kind: "wired", key: "tasks", adapter } } };
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded inside the isolated registry, after its mocks
      n8n = require("@/data/transport/n8n") as N8n;
    });
    return n8n;
  }

  it("a network failure reports offline and is thrown for the outbox; an answer, even a refusal, reports online", async () => {
    const { createN8nTransport } = withWiredTasks();
    const reports: boolean[] = [];
    const transport = createN8nTransport((online) => reports.push(online));

    await expect(transport({ method: "GET", path: "/tasks" })).rejects.toThrow("Failed to fetch");
    expect(reports).toEqual([false]);

    fetchSpy.mockImplementation(async () => ({ status: 502, text: async () => JSON.stringify({ ok: false, error: { code: "UPSTREAM_UNREACHABLE", message: "n8n did not answer" } }) }));
    expect((await transport({ method: "GET", path: "/tasks" })).status).toBe(502);
    expect(reports).toEqual([false, true]);

    fetchSpy.mockImplementation(async () => ({ status: 200, text: async () => JSON.stringify({ ok: true, data: [] }) }));
    expect(await transport({ method: "GET", path: "/tasks" })).toEqual({ status: 200, json: [] });
    expect(reports).toEqual([false, true, true]);

    // and a route answered on the device reports nothing at all
    await transport({ method: "GET", path: "/capabilities" });
    await transport({ method: "GET", path: "/usage" });
    expect(reports).toEqual([false, true, true]);
  });
});
