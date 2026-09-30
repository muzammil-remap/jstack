/**
 * ADR-93 — the production server Dokploy runs (`remap/deploy/server.mjs`) and the bundle check its image
 * build runs (`remap/deploy/bundle-check.mjs`).
 *
 * The server is started for real, in a child process (it is an ES module Jest cannot load), in front of a
 * stand-in n8n in this process and a small export in a temp directory. Requests go through `node:http`,
 * not `fetch`, so a path is sent exactly as written — `/../` included.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { READS, WRITES } from "@/data/n8n/registry";

const app = join(__dirname, "..", "..");
const serverFile = join(app, "..", "remap", "deploy", "server.mjs");
const checkFile = join(app, "..", "remap", "deploy", "bundle-check.mjs");
// made per run: a site password the tests use, never one written down
const PASSWORD = randomBytes(18).toString("base64url");
const AUTH = `Basic ${Buffer.from(`remap:${PASSWORD}`).toString("base64")}`;

type Reply = { status: number; headers: IncomingHttpHeaders; body: string };

function call(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

function prodAllow(): Record<string, string> {
  const script = `const m = await import(${JSON.stringify(pathToFileURL(serverFile).href)}); console.log(JSON.stringify(m.PROD_ALLOW));`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: app, encoding: "utf8" })) as Record<string, string>;
}

describe("ADR-93 · the production allow-list is exactly the keys the app calls", () => {
  const allow = prodAllow();
  // the registry rows, and the calls an adapter makes itself (Approve → gmail-draft, Block it → calendar-edit)
  const adapterCalls = readdirSync(join(app, "data", "n8n", "adapters")).flatMap((name) =>
    [...readFileSync(join(app, "data", "n8n", "adapters", name), "utf8").matchAll(/callWebhook\("([a-z-]+)"/g)].map((m) => m[1]),
  );
  const used = new Set([
    ...adapterCalls,
    ...Object.values(READS).flatMap((row) => (row?.kind === "wired" ? [row.key] : row?.kind === "derived" ? [...row.uses] : [])),
    ...Object.values(WRITES).map((w) => w!.key),
  ]);

  it("the two sets are one — a key the app starts calling fails here until it is let through", () => {
    expect(Object.keys(allow).sort()).toEqual([...used].sort());
  });

  it("never the private memory, nor a workflow that sends or returns file bytes", () => {
    expect(Object.keys(allow)).not.toContain("memory");
    expect(Object.values(allow).filter((p) => /memory|gmail-compose|gmail-reply|send-or-queue|calendar-create|dropbox-fetch/i.test(p))).toEqual([]);
  });
});

describe("ADR-93 · remap/deploy/server.mjs", () => {
  let dist: string;
  let upstream: Server;
  let upstreamPort = 0;
  const seen: { path: string; headers: IncomingHttpHeaders; body: string }[] = [];
  let child: ChildProcess;
  let port = 0;

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), "jstack-serve-"));
    mkdirSync(join(dist, "_expo", "static", "js", "web"), { recursive: true });
    mkdirSync(join(dist, "icons"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>JSTACK</title>");
    writeFileSync(join(dist, "_expo", "static", "js", "web", "entry-abc.js"), `const base = "/n8n"; ${"x".repeat(2000)}`);
    writeFileSync(join(dist, "manifest.webmanifest"), "{}");
    writeFileSync(join(dist, "icons", "icon-192.png"), "png");
    writeFileSync(join(dist, ".jstack-source.json"), "{}");
    writeFileSync(join(dist, "_headers"), readFileSync(join(app, "public", "_headers"), "utf8"));

    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, data: { items: [] } }));
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    upstreamPort = (upstream.address() as { port: number }).port;

    child = spawn(process.execPath, [serverFile], {
      env: {
        ...process.env,
        PORT: "0",
        JSTACK_DIST: dist,
        N8N_BASE: `http://127.0.0.1:${upstreamPort}/`,
        N8N_AUTH_HEADER: "x-test-auth",
        N8N_AUTH_VALUE: "the-webhook-secret",
        BASIC_AUTH_USER: "remap",
        BASIC_AUTH_PASSWORD: PASSWORD,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    port = await new Promise<number>((resolve, reject) => {
      let out = "";
      child.stdout!.on("data", (c: Buffer) => {
        out += c.toString();
        const m = /jstack on :(\d+)/.exec(out);
        if (m) resolve(Number(m[1]));
      });
      child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
    });
  });

  afterAll(async () => {
    child?.kill();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    rmSync(dist, { recursive: true, force: true });
  });

  it("the whole site asks for the password; only /healthz, the manifest and its icons do not", async () => {
    const none = await call(port, "GET", "/");
    expect(none.status).toBe(401);
    expect(none.headers["www-authenticate"]).toMatch(/^Basic realm="JSTACK"/);
    expect((await call(port, "GET", "/", { authorization: `Basic ${Buffer.from("remap:wrong-password-xxxxxx").toString("base64")}` })).status).toBe(401);
    expect((await call(port, "POST", "/n8n/tasks", { "content-type": "application/json" }, "{}")).status).toBe(401);
    expect((await call(port, "GET", "/healthz")).status).toBe(200);
    expect((await call(port, "GET", "/manifest.webmanifest")).status).toBe(200);
    expect((await call(port, "GET", "/icons/icon-192.png")).status).toBe(200);
  });

  it("the app, with the headers of public/_headers; a route is index.html, a missing file is a 404", async () => {
    const root = await call(port, "GET", "/", { authorization: AUTH });
    expect(root.status).toBe(200);
    expect(root.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(root.headers["strict-transport-security"]).toContain("max-age=");
    expect(root.headers["cache-control"]).toBe("no-cache");
    expect((await call(port, "GET", "/tasks", { authorization: AUTH })).body).toContain("<title>JSTACK</title>");
    const js = await call(port, "GET", "/_expo/static/js/web/entry-abc.js", { authorization: AUTH, "accept-encoding": "gzip" });
    expect(js.headers["cache-control"]).toContain("immutable");
    expect(js.headers["content-encoding"]).toBe("gzip");
    expect((await call(port, "GET", "/_expo/static/js/web/missing.js", { authorization: AUTH })).status).toBe(404);
  });

  it("nothing outside the export, no dotfile", async () => {
    for (const path of ["/../package.json", "/%2e%2e/%2e%2e/package.json", "/..%2f..%2fpackage.json", "/.jstack-source.json"]) {
      const r = await call(port, "GET", path, { authorization: AUTH });
      expect({ path, leaked: r.body.includes('"name"') || r.body === "{}" }).toEqual({ path, leaked: false });
    }
  });

  it("forwards an allowed key's JSON to its webhook with the n8n header, and nothing of the browser's", async () => {
    const r = await call(port, "POST", "/n8n/tasks", { authorization: AUTH, "content-type": "application/json", origin: `http://127.0.0.1:${port}`, cookie: "c=1" }, '{"op":"list"}');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true, data: { items: [] } });
    expect(r.headers["cache-control"]).toBe("no-store");
    const last = seen[seen.length - 1];
    expect(last.path).toBe("/webhook/jstack-dash-tasks-read");
    expect(last.headers["x-test-auth"]).toBe("the-webhook-secret");
    expect(last.headers.authorization).toBeUndefined();
    expect(last.headers.cookie).toBeUndefined();
    expect(last.body).toBe('{"op":"list"}');
    expect(r.body).not.toContain("the-webhook-secret");
  });

  it("refuses what the app never sends: other keys, other methods, other types, other sites, big bodies", async () => {
    const json = { authorization: AUTH, "content-type": "application/json" };
    const before = seen.length;
    expect((await call(port, "POST", "/n8n/memory", json, "{}")).status).toBe(404);
    expect((await call(port, "POST", "/n8n/gmail-compose", json, "{}")).status).toBe(404);
    // normalised to /webhook/…, a path of the export: refused there, never proxied
    expect((await call(port, "POST", "/n8n/../webhook/jstack-memory-search", json, "{}")).status).toBe(405);
    expect((await call(port, "GET", "/n8n/tasks", { authorization: AUTH })).status).toBe(405);
    expect((await call(port, "POST", "/n8n/tasks", { authorization: AUTH, "content-type": "text/plain" }, '{"op":"list"}')).status).toBe(415);
    expect((await call(port, "POST", "/n8n/tasks", { ...json, origin: "https://elsewhere.example" }, "{}")).status).toBe(403);
    expect((await call(port, "POST", "/n8n/tasks", { ...json, origin: "null" }, "{}")).status).toBe(403);
    expect((await call(port, "POST", "/n8n/tasks", { ...json, "sec-fetch-site": "cross-site" }, "{}")).status).toBe(403);
    expect((await call(port, "POST", "/n8n/tasks", json, JSON.stringify({ text: "x".repeat(17 * 1024) }))).status).toBe(413);
    expect(seen.length).toBe(before);
  });

  it("will not start without its secrets, or with a short password", () => {
    const base = { ...process.env, PORT: "0", JSTACK_DIST: dist, N8N_BASE: "http://127.0.0.1:1", N8N_AUTH_HEADER: "h", N8N_AUTH_VALUE: "v", BASIC_AUTH_USER: "u", BASIC_AUTH_PASSWORD: PASSWORD };
    const run = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, [serverFile], { env, encoding: "utf8", timeout: 10_000 });
    const noSecret = run({ ...base, N8N_AUTH_VALUE: "" });
    expect(noSecret.status).toBe(1);
    expect(noSecret.stderr).toContain("N8N_AUTH_VALUE is not set");
    const short = run({ ...base, BASIC_AUTH_PASSWORD: "short" });
    expect(short.status).toBe(1);
    expect(short.stderr).toContain("shorter than 16");
  });
});

describe("ADR-93 · remap/deploy/bundle-check.mjs can fail", () => {
  const check = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "jstack-bundle-"));
    try {
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
      return spawnSync(process.execPath, [checkFile, dir], { encoding: "utf8", env: { ...process.env, N8N_AUTH_VALUE: "planted-secret-value" } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("a clean export passes", () => {
    expect(check({ "app.js": 'const base = "/n8n";', "index.html": "<html></html>" }).status).toBe(0);
  });

  it.each([
    ["a webhook path", 'fetch("https://n8n/webhook/x"); const b = "/n8n";'],
    ["a workflow name", 'const w = "jstack-dash-tasks-read"; const b = "/n8n";'],
    ["the test hook", 'globalThis.__JSTACK__ = {}; const b = "/n8n";'],
    ["the dev proxy", 'const b = "http://127.0.0.1:8787/n8n"; const c = "/n8n";'],
    ["the auth value", 'const s = "planted-secret-value"; const b = "/n8n";'],
    ["no /n8n at all (a rewritten base URL)", 'const b = "C:/Program Files/Git/n8n";'],
  ])("fails on %s", (_what, js) => {
    expect(check({ "app.js": js }).status).toBe(1);
  });
});
