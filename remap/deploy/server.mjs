#!/usr/bin/env node
/**
 * JSTACK production server — what Dokploy runs (ADR-93, `remap/DEPLOY_N8N.md`).
 *
 *   browser ──HTTPS──▶ Traefik (Dokploy: domain + certificate) ──HTTP──▶ this server
 *                                                                      ├─ GET  /…          the app (build:web:prod)
 *                                                                      └─ POST /n8n/<key>  ──▶ <N8N_BASE>/webhook/<path>
 *
 * It does the three jobs CLAUDE.md §5 gave nginx, in one process with no dependencies:
 *  - **HTTP Basic Auth on the whole site** — the real access control (ADR-77); the passkey only locks the
 *    device. Open without it: `/healthz`, and the manifest and its icons, which browsers fetch without
 *    credentials (a 401 there is a console error and no install prompt) and which carry nothing of Josh's.
 *  - **The app**: the export's files, the headers of `public/_headers` (CSP, HSTS, caching), and every other
 *    path answered with `index.html` (Expo Router routes on the client).
 *  - **The n8n proxy**: only the keys the app calls — the dev proxy's list without `memory` and `people`
 *    (`PROD_ALLOW`, held to the registry by `tests/unit/n8nServe.test.ts`). It adds the n8n header auth, so the
 *    secret never reaches a browser, and takes JSON from this site only: a form on another site cannot
 *    send `application/json`, and `Origin` / `Sec-Fetch-Site` must say same-origin (the browser would
 *    attach the site password to a cross-site form post).
 *
 * Environment (all required except PORT and JSTACK_DIST; it refuses to start without them):
 *   N8N_BASE              e.g. http://n8n:5678 on Dokploy's network, or n8n's public https address
 *   N8N_AUTH_HEADER       the header name of the "JSTACK Webhook Auth" credential
 *   N8N_AUTH_VALUE        its value
 *   BASIC_AUTH_USER       the site's user name
 *   BASIC_AUTH_PASSWORD   the site's password, 16 characters or more
 *   PORT                  default 8080
 *   JSTACK_DIST           the export, default /srv/dist
 */
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { ALLOW } from "../dev-proxy.mjs";

/** Keys the dev proxy knows and the app never calls: not reachable from the internet. `memory` returns
 * Josh's private memory, sensitive types included (N8N-18); `people` waits on Josh (N8N-17). */
const NOT_CALLED = new Set(["memory", "people"]);
export const PROD_ALLOW = Object.fromEntries(Object.entries(ALLOW).filter(([key]) => !NOT_CALLED.has(key)));

const MAX_BODY = 16 * 1024; // as the dev proxy: every write the app makes was checked through it
const TIMEOUT_MS = 20_000; // above the app's own 15 s (API_TIMEOUT_MS)
const PUBLIC = /^\/(healthz|manifest\.webmanifest|icons\/[\w.-]+\.png)$/;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".ttf", ".otf", ".map", ".txt"]);

/** `public/_headers` (Netlify format): a path pattern, then its indented `Name: value` lines. */
export function parseHeaderRules(text) {
  const rules = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    } else if (current != null) {
      const m = /^\s*([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
      if (m) current.headers.push([m[1], m[2]]);
    }
  }
  return rules;
}

const ruleMatches = (pattern, path) => (pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path);

export function createJstackServer({ dist, base, header, value, user, password, fetchImpl = fetch, log = console.log }) {
  const root = resolve(dist);
  const rules = parseHeaderRules(readFileSync(resolve(root, "_headers"), "utf8"));
  const expected = createHash("sha256").update(`${user}:${password}`).digest();
  const files = new Map(); // path → { body, gz, type } — the export is small and never changes while running

  const headersFor = (path) => {
    const out = {};
    for (const rule of rules) if (ruleMatches(rule.pattern, path)) for (const [k, v] of rule.headers) out[k.toLowerCase()] = v;
    return out;
  };

  const authorized = (req) => {
    const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(req.headers.authorization ?? "");
    if (m == null) return false;
    return timingSafeEqual(createHash("sha256").update(Buffer.from(m[1], "base64").toString("utf8")).digest(), expected);
  };

  const json = (res, status, obj, extra = {}) => {
    res.writeHead(status, { ...headersFor("/n8n"), "content-type": "application/json", "cache-control": "no-store", ...extra });
    res.end(JSON.stringify(obj));
  };

  /** A file of the export, or null. Never outside it, never a dotfile, never `_headers` itself. */
  const load = (urlPath) => {
    let rel;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (rel.includes("\0") || rel.split("/").some((part) => part.startsWith(".")) || rel === "/_headers") return null;
    const file = resolve(root, "." + rel);
    if (!file.startsWith(root + sep)) return null;
    if (files.has(file)) return files.get(file);
    if (!existsSync(file) || !statSync(file).isFile()) return null;
    const body = readFileSync(file);
    const ext = extname(file).toLowerCase();
    const entry = { body, gz: COMPRESSIBLE.has(ext) && body.length > 1024 ? gzipSync(body) : null, type: MIME[ext] ?? "application/octet-stream" };
    files.set(file, entry);
    return entry;
  };

  const sendFile = (req, res, urlPath, entry, extra = {}) => {
    const gzip = entry.gz != null && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
    const body = gzip ? entry.gz : entry.body;
    res.writeHead(200, {
      ...headersFor(urlPath),
      "content-type": entry.type,
      "content-length": body.length,
      ...(entry.gz != null ? { vary: "accept-encoding" } : {}),
      ...(gzip ? { "content-encoding": "gzip" } : {}),
      ...extra,
    });
    res.end(req.method === "HEAD" ? undefined : body);
  };

  const proxy = async (req, res, key) => {
    const target = PROD_ALLOW[key];
    if (target == null) return json(res, 404, { ok: false, error: { code: "NOT_ALLOWED", message: "unknown dashboard route" } });
    if (req.method !== "POST") return json(res, 405, { ok: false, error: { code: "METHOD", message: "POST only" } }, { allow: "POST" });
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) return json(res, 415, { ok: false, error: { code: "JSON_ONLY", message: "application/json only" } });
    const site = req.headers["sec-fetch-site"];
    const origin = req.headers.origin;
    const sameHost = (() => {
      try {
        return new URL(origin).host === req.headers.host;
      } catch {
        return false; // "null" (a sandboxed frame, a file) or nonsense
      }
    })();
    if ((site != null && site !== "same-origin") || (origin != null && !sameHost)) {
      return json(res, 403, { ok: false, error: { code: "CROSS_SITE", message: "this site only" } });
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return json(res, 413, { ok: false, error: { code: "TOO_LARGE", message: "body too large" } });
      chunks.push(chunk);
    }
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // a fresh header set: nothing of the browser's (its site password least of all) goes on to n8n
      const up = await fetchImpl(`${base}/webhook/${target}`, {
        method: "POST",
        headers: { "content-type": "application/json", [header]: value },
        body: Buffer.concat(chunks).toString("utf8") || "{}",
        signal: ctrl.signal,
      });
      const text = await up.text();
      // key, status and duration only: the bodies carry Josh's personal data
      log(`${new Date().toISOString()} ${key} → ${up.status} ${Date.now() - started}ms`);
      res.writeHead(up.status, { ...headersFor("/n8n"), "content-type": up.headers.get("content-type") || "application/json", "cache-control": "no-store" });
      res.end(text);
    } catch {
      log(`${new Date().toISOString()} ${key} → failed ${Date.now() - started}ms (${ctrl.signal.aborted ? "timeout" : "network"})`);
      json(res, 502, { ok: false, error: { code: ctrl.signal.aborted ? "TIMEOUT" : "UPSTREAM_UNREACHABLE", message: "n8n did not answer" } });
    } finally {
      clearTimeout(timer);
    }
  };

  return createServer(async (req, res) => {
    let path;
    try {
      path = new URL(req.url ?? "/", "http://jstack.local").pathname;
    } catch {
      return json(res, 400, { ok: false, error: { code: "BAD_REQUEST", message: "bad path" } });
    }
    if (path === "/healthz") return res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }).end("ok");
    if (!PUBLIC.test(path) && !authorized(req)) {
      res.writeHead(401, { "www-authenticate": 'Basic realm="JSTACK", charset="UTF-8"', "content-type": "text/plain", "cache-control": "no-store" });
      return res.end("Sign in to open JSTACK.");
    }
    const n8n = /^\/n8n\/([a-z0-9-]+)$/.exec(path);
    if (n8n != null) return proxy(req, res, n8n[1]);
    if (path.startsWith("/n8n")) return json(res, 404, { ok: false, error: { code: "NOT_ALLOWED", message: "unknown dashboard route" } });

    // the PWA share target posts here; the service worker takes it when installed. Before that, open the
    // route and drop the body — the words are never logged or kept (SEC-11)
    if (req.method === "POST" && path === "/capture") return res.writeHead(303, { location: "/capture", "cache-control": "no-store" }).end();
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405, { allow: "GET, HEAD" }).end();

    const entry = path === "/" ? null : load(path);
    if (entry != null) return sendFile(req, res, path, entry, extname(path) === ".html" ? { "cache-control": "no-cache" } : {});
    // a path with an extension is a missing file, not a route: a 404, never the app's HTML
    if (extname(path) !== "") return res.writeHead(404, { ...headersFor(path), "content-type": "text/plain" }).end("Not found");
    const index = load("/index.html");
    return sendFile(req, res, "/index.html", index, { "cache-control": "no-cache" });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const env = process.env;
  const dist = env.JSTACK_DIST ?? "/srv/dist";
  const missing = ["N8N_BASE", "N8N_AUTH_HEADER", "N8N_AUTH_VALUE", "BASIC_AUTH_USER", "BASIC_AUTH_PASSWORD"].filter((k) => !env[k]);
  const problems = [
    ...missing.map((k) => `${k} is not set`),
    ...(env.BASIC_AUTH_PASSWORD && env.BASIC_AUTH_PASSWORD.length < 16 ? ["BASIC_AUTH_PASSWORD is shorter than 16 characters"] : []),
    ...(existsSync(resolve(dist, "index.html")) && existsSync(resolve(dist, "_headers")) ? [] : [`no export in ${dist} (index.html and _headers)`]),
  ];
  if (problems.length > 0) {
    console.error(`jstack: not starting — ${problems.join("; ")}. See remap/DEPLOY_N8N.md.`);
    process.exit(1);
  }
  const port = Number(env.PORT ?? 8080);
  const server = createJstackServer({
    dist,
    base: env.N8N_BASE.replace(/\/+$/, ""),
    header: env.N8N_AUTH_HEADER,
    value: env.N8N_AUTH_VALUE,
    user: env.BASIC_AUTH_USER,
    password: env.BASIC_AUTH_PASSWORD,
  });
  server.listen(port, "0.0.0.0", () => console.log(`jstack on :${server.address().port} — the app from ${dist}; /n8n/{${Object.keys(PROD_ALLOW).join(",")}}`));
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
}
