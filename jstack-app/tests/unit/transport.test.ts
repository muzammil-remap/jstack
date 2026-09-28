/**
 * CT-04 — the mock server behind node:http, driven through the real
 * `httpTransport` (fetch, not the in-process router), proves the HTTP path
 * itself: status codes 401/403/409/422/423 arrive over the wire and
 * `ApiAdapter` turns them into a `ContractError` with the same shape the
 * in-process transport gives it (server.test.ts covers the store-level
 * behaviour; this file covers the wire).
 */
import { createServer, type Server } from "node:http";
import { reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { TransportRequest } from "@/data/transport/Transport";

const REPO_ROOT = __dirname + "/../..";

let server: Server;
let baseUrl: string;
/** the request line the server last received (WPF-1) */
let lastUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        lastUrl = req.url ?? "/";
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => (query[k] = v));
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const body = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : undefined;
        // a deployment serves the API under a prefix (HANDOVER.md: https://<host>/api/v1); the mock's routes do not carry it
        const path = url.pathname.replace(/^\/api\/v1(?=\/)/, "");
        const result = await handle({ method: (req.method ?? "GET") as TransportRequest["method"], path, query, body });
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(result.json != null ? JSON.stringify(result.json) : "");
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address != null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function loadWithBase(credentials: "same-origin" | "include" = "same-origin", path = ""): {
  ApiAdapter: typeof import("@/data/ApiAdapter").ApiAdapter;
  httpTransport: typeof import("@/data/transport/http").httpTransport;
} {
  jest.resetModules();
  jest.doMock("@/data/config", () => ({
    API_BASE_URL: baseUrl + path,
    API_TIMEOUT_MS: 15_000,
    UPLOAD_TIMEOUT_MS: 60_000,
    API_CREDENTIALS: credentials,
    AUTH: { getToken: async () => null },
    USE_API_ADAPTER: true,
  }));
  /* eslint-disable @typescript-eslint/no-require-imports */
  const adapterMod = require("@/data/ApiAdapter") as typeof import("@/data/ApiAdapter");
  const transportMod = require("@/data/transport/http") as typeof import("@/data/transport/http");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { ApiAdapter: adapterMod.ApiAdapter, httpTransport: transportMod.httpTransport };
}

beforeEach(() => {
  reset();
  jest.dontMock("@/data/config");
});

describe("CT-04 httpTransport over node:http", () => {
  it("GET /today (200) round-trips through fetch and JSON.parse", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase();
    const adapter = new ApiAdapter(httpTransport);
    const today = await adapter.getToday();
    expect(today.dayName).toBeDefined();
  });

  it("WPF-1: a base URL with a path keeps it — a call goes under /api/v1, not to the origin's root", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase("same-origin", "/api/v1");
    const adapter = new ApiAdapter(httpTransport);
    await adapter.getToday();
    expect(lastUrl.split("?")[0]).toBe("/api/v1/today");
  });

  it("a locked session surfaces as ContractError({status: 401})", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase();
    const adapter = new ApiAdapter(httpTransport);
    await adapter.postLock({ nonce: "n", biometricAssertion: "a" });
    await expect(adapter.getToday()).rejects.toMatchObject({ status: 401 });
    await adapter.postRecover({ recoveryKey: "k", nonce: "n", biometricAssertion: "a" });
  });

  it("a t1-sensitivity read surfaces as ContractError({status: 403})", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase();
    const adapter = new ApiAdapter(httpTransport);
    await expect(adapter.getTask("t1-sensitive")).rejects.toMatchObject({ status: 403 });
  });

  it("a late undo surfaces as ContractError({status: 409})", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase();
    const adapter = new ApiAdapter(httpTransport);
    await expect(adapter.postActionUndo("c1")).rejects.toMatchObject({ status: 409 });
  });

  it("hiding a pinned section surfaces as ContractError({status: 422})", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase();
    const adapter = new ApiAdapter(httpTransport);
    await expect(adapter.putLayout("today", { hidden: ["needs"] })).rejects.toMatchObject({ status: 422 });
  });

  it("a locked notification group surfaces as ContractError({status: 423})", async () => {
    const { ApiAdapter, httpTransport } = loadWithBase();
    const adapter = new ApiAdapter(httpTransport);
    const groups = await adapter.getNotificationGroups();
    const security = groups.find((g) => g.name === "Security")!;
    await expect(adapter.putNotificationGroup(security.id, { ...security.devices, pc: false })).rejects.toMatchObject({ status: 423 });
  });

  it("WPF-2: an HTML error page keeps its status, and a replay behind it keeps the capture queued", async () => {
    // a proxy in front of the API answering for it: an error, and not JSON
    const gateway = createServer((_req, res) => {
      res.writeHead(502, { "content-type": "text/html" });
      res.end("<html><body>Bad gateway</body></html>");
    });
    await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    const address = gateway.address();
    const port = typeof address === "object" && address != null ? address.port : 0;
    try {
      jest.resetModules();
      jest.doMock("@/data/config", () => ({ API_BASE_URL: `http://127.0.0.1:${port}`, API_TIMEOUT_MS: 15_000, UPLOAD_TIMEOUT_MS: 60_000, API_CREDENTIALS: "same-origin", AUTH: { getToken: async () => null }, USE_API_ADAPTER: true }));
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { httpTransport } = require("@/data/transport/http") as typeof import("@/data/transport/http");
      const { withOutbox } = require("@/data/transport/outbox") as typeof import("@/data/transport/outbox");
      const { memoryQueue } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
      /* eslint-enable @typescript-eslint/no-require-imports */
      await expect(httpTransport({ method: "GET", path: "/today" })).resolves.toMatchObject({ status: 502 });

      const queue = memoryQueue();
      const outbox = withOutbox(httpTransport, queue, () => false);
      await outbox.transport({ method: "POST", path: "/brain/dump", body: { text: "kept", source: "typed" } });
      const { conflicts } = await outbox.replay();
      expect(conflicts).toEqual([]);
      expect(await queue.all()).toHaveLength(1);
    } finally {
      gateway.closeAllConnections();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });
});

describe("D-4 · a request that never answers is abandoned, not left to hang forever", () => {
  it("aborts after API_TIMEOUT_MS and surfaces as the network failure the outbox already recognises", async () => {
    // A server that accepts the connection and answers nothing, ever — not
    // a slow one that eventually responds, the case a timeout exists for.
    const hangServer = createServer(() => {
      /* never calls res.end() */
    });
    await new Promise<void>((resolve) => hangServer.listen(0, "127.0.0.1", resolve));
    const address = hangServer.address();
    const hangPort = typeof address === "object" && address != null ? address.port : 0;

    jest.resetModules();
    jest.doMock("@/data/config", () => ({
      API_BASE_URL: `http://127.0.0.1:${hangPort}`,
      API_TIMEOUT_MS: 50, // real production default is 15s; kept short so this test does not take 15s to prove it
      UPLOAD_TIMEOUT_MS: 50,
      API_CREDENTIALS: "same-origin",
      AUTH: { getToken: async () => null },
      USE_API_ADAPTER: true,
    }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { httpTransport } = require("@/data/transport/http") as typeof import("@/data/transport/http");

    try {
      await expect(httpTransport({ method: "GET", path: "/today", query: {}, body: undefined })).rejects.toThrow(/network timeout/i);
    } finally {
      await new Promise<void>((resolve) => hangServer.close(() => resolve()));
    }
  });

  /**
   * D-13 — the timer used to clear the instant `fetch` RESOLVED, which is
   * headers-in and status-known, not "the response arrived". A server that
   * answers promptly and then stalls the BODY left nothing armed to abort
   * `res.text()`, hanging the caller the timeout exists to release. This
   * server does exactly that: `writeHead` and never another byte.
   */
  it("a server that answers promptly and then stalls the body is still abandoned, not left to hang on the body read", async () => {
    const stallServer = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      // `writeHead` alone buffers; without a flush `fetch` never sees even
      // the status line, and the test would prove nothing past what D-4
      // already does — this is the line that puts it PAST that point,
      // into the body-read `fetch` had already resolved on.
      res.flushHeaders();
      // headers and status sent; the body never arrives
    });
    await new Promise<void>((resolve) => stallServer.listen(0, "127.0.0.1", resolve));
    const address = stallServer.address();
    const stallPort = typeof address === "object" && address != null ? address.port : 0;

    jest.resetModules();
    jest.doMock("@/data/config", () => ({
      API_BASE_URL: `http://127.0.0.1:${stallPort}`,
      // Well above what a loopback connection + header flush needs (D-4's
      // 50ms races that against the timer): the point of this test is the
      // BODY stall specifically, so the timer must not have any chance of
      // firing before `fetch` itself resolves — that would silently pass
      // via D-4's path and prove nothing about the body-read stage at all.
      API_TIMEOUT_MS: 300,
      UPLOAD_TIMEOUT_MS: 300,
      API_CREDENTIALS: "same-origin",
      AUTH: { getToken: async () => null },
      USE_API_ADAPTER: true,
    }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { httpTransport } = require("@/data/transport/http") as typeof import("@/data/transport/http");

    try {
      await expect(httpTransport({ method: "GET", path: "/today", query: {}, body: undefined })).rejects.toThrow(/network timeout/i);
    } finally {
      await new Promise<void>((resolve) => stallServer.close(() => resolve()));
    }
  });

  it("a queueable write that times out is queued, not thrown at its caller — data/transport/outbox.ts's own detector, not a hand-matched regex", async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { withOutbox } = require("@/data/transport/outbox") as typeof import("@/data/transport/outbox");
    const { memoryQueue } = require("@/lib/queueStore") as typeof import("@/lib/queueStore");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const timeoutError = () => new Error("network timeout: POST http://127.0.0.1:1/brain/dump did not answer");
    const inner: import("@/data/transport/Transport").Transport = async () => {
      throw timeoutError();
    };
    const outbox = withOutbox(inner, memoryQueue(), () => true);
    const res = await outbox.transport({ method: "POST", path: "/brain/dump", body: { text: "x", source: "typed" } });
    expect(res).toMatchObject({ status: 202, json: { queued: true } });
    expect(await outbox.entries()).toHaveLength(1);
  });
});

describe("D-5 · credentials are explicit on every request", () => {
  // The captured init object carries a Headers-like value the RN fetch
  // polyfill built, and jest's own deep-equal (toMatchObject/toEqual) on the
  // WHOLE object throws trying to walk it ("Map.prototype.entries called on
  // incompatible receiver") — nothing to do with credentials, so read the
  // one field out and compare that primitive instead of the object.
  it('defaults to "same-origin", not fetch\'s bare implicit default', async () => {
    const { httpTransport } = loadWithBase();
    const spy = jest.spyOn(global, "fetch");
    await httpTransport({ method: "GET", path: "/today", query: {}, body: undefined });
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.credentials).toBe("same-origin");
    spy.mockRestore();
  });

  it('sends "include" when EXPO_PUBLIC_API_CREDENTIALS=include is baked into API_CREDENTIALS', async () => {
    const { httpTransport } = loadWithBase("include");
    const spy = jest.spyOn(global, "fetch");
    await httpTransport({ method: "GET", path: "/today", query: {}, body: undefined });
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.credentials).toBe("include");
    spy.mockRestore();
  });
});

/**
 * D-13 (the other half) — `Number(undefined ?? 15_000)` reads fine, but
 * `Number("")` and `Number("fifteen")` are both `NaN`, and `setTimeout(fn,
 * NaN)` fires at once: a malformed `EXPO_PUBLIC_API_TIMEOUT_MS` would have
 * aborted every request instantly, and silently — nothing here said why.
 * `data/config.swap.ts` mirrors the same parse (D-4/D-5's own note on that
 * file), so both are proven the same way.
 */
describe("D-13 · a malformed EXPO_PUBLIC_API_TIMEOUT_MS falls back to the default rather than becoming NaN", () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_API_TIMEOUT_MS;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_API_TIMEOUT_MS;
    else process.env.EXPO_PUBLIC_API_TIMEOUT_MS = ORIGINAL;
    jest.resetModules();
  });

  it.each(["data/config", "data/config.swap"])("%s: unset, empty, non-numeric, zero and negative all land on the 15s default", (mod) => {
    // D-13b (QA): `Number.isFinite` alone let "0" and "-1" through — both are
    // genuine finite numbers, and `setTimeout(fn, 0)`/`setTimeout(fn, -1)`
    // (negative delays clamp to 0) abort every request exactly as instantly
    // as the NaN/blank cases this test already covered.
    for (const value of [undefined, "", "fifteen", "0", "-1"]) {
      jest.resetModules();
      if (value === undefined) delete process.env.EXPO_PUBLIC_API_TIMEOUT_MS;
      else process.env.EXPO_PUBLIC_API_TIMEOUT_MS = value;
      /* eslint-disable-next-line @typescript-eslint/no-require-imports */
      const { API_TIMEOUT_MS } = require(`@/${mod}`) as { API_TIMEOUT_MS: number };
      expect({ mod, value, API_TIMEOUT_MS }).toEqual({ mod, value, API_TIMEOUT_MS: 15_000 });
    }
  });

  it.each(["data/config", "data/config.swap"])("%s: a real number is still honoured", (mod) => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_TIMEOUT_MS = "5000";
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { API_TIMEOUT_MS } = require(`@/${mod}`) as { API_TIMEOUT_MS: number };
    expect(API_TIMEOUT_MS).toBe(5000);
  });
});
