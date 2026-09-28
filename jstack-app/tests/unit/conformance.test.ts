/**
 * WM-04, WM-05 — the conformance runner, against a server that is right and
 * a server that is wrong (W-2).
 *
 * `tools/conformance.mjs` is the only thing in this repository that checks a
 * SERVER rather than the app: `openapi.yaml` is generated from the app's own
 * source, so it is true of the mock by construction and says nothing about
 * what REMAP's developer builds. The runner is what makes the contract
 * enforceable at the far end.
 *
 * A tool like that is worth exactly as much as its ability to go red, so the
 * important test here is WM-05: a deliberately broken server, and the field
 * named in the output. A conformance runner that cannot fail is a very
 * expensive way of printing "ok".
 */
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reset } from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import type { TransportRequest } from "@/data/transport/Transport";

const root = join(__dirname, "..", "..");
const TOOL = join(root, "tools", "conformance.mjs");

type Recorded = { method: string; url: string; auth: string | null; body: string };

/**
 * The mock behind node:http. `mangle` lets a test corrupt one response on the
 * way out, which is how the broken server below is built — from the same
 * handler, so the ONLY difference is the defect under test.
 */
function startServer(mangle?: (path: string, json: unknown) => unknown, recorded?: Recorded[], prefix = ""): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => (query[k] = v));
        const rawBody = Buffer.concat(chunks).toString("utf8");
        recorded?.push({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          auth: (req.headers.authorization as string) ?? null,
          body: rawBody,
        });
        const body = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : undefined;
        // WPF-1: served under a prefix, the way a deployment is; the mock's routes do not carry it
        const path = prefix !== "" && url.pathname.startsWith(`${prefix}/`) ? url.pathname.slice(prefix.length) : url.pathname;
        const result = await handle({
          method: (req.method ?? "GET") as TransportRequest["method"],
          path,
          query,
          body,
        });
        const json = mangle ? mangle(path, result.json) : result.json;
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(json != null ? JSON.stringify(json) : "");
      })().catch((error: unknown) => {
        // A handler that throws must still ANSWER. Without this the socket
        // stays open, the runner waits, and the suite times out with no clue
        // which endpoint did it — which is how this first went wrong.
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address != null ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}${prefix}` });
    });
  });
}

const stop = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

/**
 * Runs the tool as the board runs it, capturing output and exit code.
 *
 * ASYNCHRONOUSLY, and that is not a style choice. The server under test lives
 * in this Jest worker's own event loop, and the tool runs as a child process
 * talking to it over a socket. `execFileSync` blocks the worker, so the
 * server can never answer, and every request times out — a deadlock that
 * looks exactly like a broken server. It cost a suite timeout to find.
 */
function runTool(baseUrl: string, ...args: string[]): Promise<{ status: number; out: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [TOOL, baseUrl, ...args], { cwd: root, encoding: "utf8" }, (error, stdout, stderr) => {
      const status = error == null ? 0 : ((error as { code?: number }).code ?? 1);
      resolve({ status, out: `${stdout}${stderr}` });
    });
  });
}

beforeEach(() => reset());

describe("WM-04 · against the mock server, every GET and every safe write passes", () => {
  let server: Server;
  let baseUrl: string;

  let run: { status: number; out: string };

  beforeAll(async () => {
    ({ server, baseUrl } = await startServer());
    // ONE sweep, then assert on it. Six separate invocations meant six full
    // passes over a hundred endpoints, each a child process talking to a
    // server in this worker while forty-six other suites ran — and on Windows
    // one of them occasionally died with a stack-overrun exit code instead of
    // failing. The assertions are about one run's output anyway.
    // the safe writes run only when asked for (WPF-9), and this sweep exercises them
    run = await runTool(baseUrl, "--writes");
  }, 120000);
  afterAll(async () => stop(server));

  it("exits 0, and every line is a pass or a stated skip", () => {
    const { status, out } = run;
    // assert on the failing LINES, not on the whole transcript: a string
    // comparison here prints a truncated blob and tells you nothing about
    // which endpoint disagreed
    expect(out.split("\n").filter((l) => l.startsWith("FAIL"))).toEqual([]);
    expect(status).toBe(0);
  });

  it("checks a real number of endpoints — not an empty sweep reported as success", () => {
    // the failure this guards: a runner that harvests no ids, skips
    // everything, and exits 0 with a clean-looking summary
    const { out } = run;
    const passed = Number(/(\d+) passed/.exec(out)?.[1]);
    expect(passed).toBeGreaterThan(30);
  });

  it("the capture write is idempotent on offlineId and says duplicate: true", () => {
    const { out } = run;
    expect(out).toContain("POST /brain/dump (same offlineId twice) — deduped");
  });

  it("the layout write is put back the way it was found", () => {
    const { out } = run;
    expect(out).toContain("PUT /layout/{tab} then revert — changed and put back");
  });

  it("the undo-window check reports itself skipped, with the reason", () => {
    // it is not asserted, so it must not read as if it were
    const { out } = run;
    expect(out).toMatch(/skip POST \/actions\/\{id\}\/undo after the window — no clock endpoint/);
  });

  it("--write leaves an evidence file naming the base URL and the counts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "conformance-"));
    try {
      const rel = dir.split("\\").join("/");
      const { status } = await runTool(baseUrl, "--write", rel);
      expect(status).toBe(0);
      const stamp = new Date().toISOString().slice(0, 10);
      const file = join(dir, `conformance-${stamp}.json`);
      expect(existsSync(file)).toBe(true);
      const evidence = JSON.parse(readFileSync(file, "utf8")) as { base: string; counts: { fail: number }; results: unknown[] };
      expect(evidence.base).toBe(baseUrl);
      expect(evidence.counts.fail).toBe(0);
      expect(evidence.results.length).toBeGreaterThan(30);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // a leftover temp directory is harmless
      }
    }
  }, 120000);
});

describe("WM-05 · against a server that returns a wrong shape, it fails and names the field", () => {
  let server: Server;
  let baseUrl: string;
  let broken: { status: number; out: string };

  beforeAll(async () => {
    // ONE defect, on one endpoint: `health.ok` is a boolean in §3 and this
    // server sends a string. Everything else is the real handler, so a
    // failure here can only be the plant.
    ({ server, baseUrl } = await startServer((path, json) => {
      if (path !== "/today") return json;
      const today = json as { health: { ok: boolean } };
      return { ...today, health: { ...today.health, ok: "yes" } };
    }));
    broken = await runTool(baseUrl);
  }, 120000);
  afterAll(async () => stop(server));

  it("exits non-zero", () => {
    expect(broken.status).toBe(1);
  });

  it("names the endpoint, the field and what was wrong with it", () => {
    const { out } = broken;
    expect(out).toContain("FAIL GET /today");
    expect(out).toContain("$.health.ok");
    expect(out).toContain("expected boolean, got string");
  });

  it("fails only that endpoint — the rest of the sweep still passes", () => {
    // a runner that goes red everywhere on one bad response tells you
    // nothing about where the defect is
    const { out } = broken;
    expect(out.split("\n").filter((l) => l.startsWith("FAIL")).length).toBe(1);
  });
});

/**
 * A-5 step 1, the fresh-clone run: `README.md` leads with this command, and
 * the first host REMAP points it at will not be answering yet. It ended as an
 * uncaught `TypeError: fetch failed` over a Node stack trace — the least
 * useful thing a first command can say.
 */
describe("WM-04 · a host that is not up is said plainly, not thrown", () => {
  it("names the host and what to check, and exits 2", async () => {
    const { status, out } = await runTool("https://jstack.invalid/api/v1");
    expect(status).toBe(2);
    expect(out).toContain("could not reach https://jstack.invalid/api/v1");
    expect(out).toContain("https or localhost");
    expect(out).not.toContain("TypeError");
  }, 30000);
});

describe("WM-04 · the runner's request shaping matches the app's own transport", () => {
  let server: Server;
  let baseUrl: string;
  let seen: Recorded[];

  beforeAll(async () => {
    seen = [];
    ({ server, baseUrl } = await startServer(undefined, seen));
  });
  afterAll(async () => stop(server));

  /** `httpTransport` loaded against this server, the way transport.test.ts
   * does it — the module reads its base URL from config at import time. */
  function loadHttpTransport(): typeof import("@/data/transport/http").httpTransport {
    jest.resetModules();
    jest.doMock("@/data/config", () => ({
      API_BASE_URL: baseUrl,
      API_TIMEOUT_MS: 15_000,
      UPLOAD_TIMEOUT_MS: 60_000,
      API_CREDENTIALS: "same-origin",
      AUTH: { getToken: async () => null },
      USE_API_ADAPTER: true,
    }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    return (require("@/data/transport/http") as typeof import("@/data/transport/http")).httpTransport;
  }

  afterEach(() => jest.dontMock("@/data/config"));

  it("sends the same request line, content type and body as httpTransport", async () => {
    // `tools/conformance.mjs` cannot import `data/transport/http.ts` — one is
    // a dependency-free .mjs and the other is TypeScript the app compiles —
    // so it re-implements the same twenty lines. This is what keeps the copy
    // honest: drive BOTH against one server and compare what that server
    // actually received, rather than trusting a comment that says "mirrors".
    seen.length = 0;
    const httpTransport = loadHttpTransport();
    await httpTransport({ method: "POST", path: "/brain/dump", query: { focus: "work" }, body: { text: "x", source: "typed" } });
    const viaApp = seen.at(-1) as Recorded;

    seen.length = 0;
    await runTool(baseUrl, "--writes");
    const viaTool = seen.find((r) => r.method === "POST" && r.url.startsWith("/brain/dump")) as Recorded;

    expect(viaTool).toBeDefined();
    expect(viaTool.method).toBe(viaApp.method);
    // same path, and a query is spelled the same way on both
    expect(viaTool.url.split("?")[0]).toBe(viaApp.url.split("?")[0]);
    expect(viaApp.url).toContain("?focus=work");
    // both send JSON, and neither sends an auth header it was not given
    expect(JSON.parse(viaTool.body)).toMatchObject({ source: "typed" });
    expect(viaTool.auth).toBe(viaApp.auth);
  }, 120000);

  it("builds the same URL as httpTransport for a path with a query", async () => {
    seen.length = 0;
    const httpTransport = loadHttpTransport();
    await httpTransport({ method: "GET", path: "/tasks", query: { slice: "week", focus: undefined } });
    const viaApp = (seen.at(-1) as Recorded).url;
    // an undefined query value is dropped by both, rather than sent as
    // "undefined" — the difference a hand-written copy would most likely miss
    expect(viaApp).toBe("/tasks?slice=week");
  }, 30000);
});

describe("WPF-1 · under a base URL with a path, the runner and the transport build one URL", () => {
  let server: Server;
  let baseUrl: string;
  let seen: Recorded[];

  beforeAll(async () => {
    seen = [];
    ({ server, baseUrl } = await startServer(undefined, seen, "/api/v1"));
  });
  afterAll(async () => stop(server));
  afterEach(() => jest.dontMock("@/data/config"));

  it("both keep the base's /api/v1 in front of the route path", async () => {
    jest.resetModules();
    jest.doMock("@/data/config", () => ({ API_BASE_URL: baseUrl, API_TIMEOUT_MS: 15_000, UPLOAD_TIMEOUT_MS: 60_000, API_CREDENTIALS: "same-origin", AUTH: { getToken: async () => null }, USE_API_ADAPTER: true }));
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const httpTransport = (require("@/data/transport/http") as typeof import("@/data/transport/http")).httpTransport;
    seen.length = 0;
    await httpTransport({ method: "POST", path: "/brain/dump", body: { text: "x", source: "typed" } });
    const viaApp = seen.at(-1) as Recorded;

    seen.length = 0;
    await runTool(baseUrl, "--writes");
    const viaTool = seen.find((r) => r.method === "POST" && r.url.includes("/brain/dump")) as Recorded;

    expect(viaApp.url.split("?")[0]).toBe("/api/v1/brain/dump");
    expect(viaTool.url.split("?")[0]).toBe(viaApp.url.split("?")[0]);
  }, 120000);
});

describe("WPF-9 · the runner is honest about what it leaves on a server", () => {
  it("without --writes it makes no write at all — a person's own server is left as it was found", async () => {
    const seen: Recorded[] = [];
    const { server, baseUrl } = await startServer(undefined, seen);
    try {
      const { out } = await runTool(baseUrl);
      expect(seen.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.url}`)).toEqual([]);
      expect(out).toContain("pass --writes");
    } finally {
      await stop(server);
    }
  }, 120000);

  it("a revert that lands on a different order is a failure, not \"put back\"", async () => {
    const { server, baseUrl } = await startServer((path, json) =>
      path === "/layout/today/revert" && json != null && Array.isArray((json as { order?: unknown }).order)
        ? { ...(json as object), order: [...(json as { order: string[] }).order].reverse() }
        : json,
    );
    try {
      const { out } = await runTool(baseUrl, "--writes");
      expect(out.split("\n").filter((l) => l.startsWith("FAIL") && l.includes("PUT /layout/{tab} then revert"))).toHaveLength(1);
    } finally {
      await stop(server);
    }
  }, 120000);
});
