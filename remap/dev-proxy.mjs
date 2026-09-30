#!/usr/bin/env node
/**
 * REMAP dev proxy — the local stand-in for the production nginx block.
 *
 *   browser ──POST /n8n/<key>──▶ this proxy ──POST <N8N_BASE>/webhook/<path>──▶ n8n
 *
 * Why it exists:
 *  - The n8n webhook secret (header auth) must never be in the browser bundle.
 *    Every JSTACK webhook shares one credential, including the ones that SEND
 *    (gmail-compose, gmail-reply). The proxy adds the header.
 *  - Only allow-listed dashboard webhooks are reachable. The browser sends a short key
 *    ("calendar"), never an n8n path, so it cannot reach anything else.
 *  - Local dev runs on another port, so the proxy answers CORS for loopback only.
 *
 * No dependencies. Config: remap/.env.local (gitignored), or real env vars.
 *   N8N_BASE=https://<n8n-host>          (no trailing slash)
 *   N8N_AUTH_HEADER=<header name from the "JSTACK Webhook Auth" credential>
 *   N8N_AUTH_VALUE=<its value>
 *   PROXY_PORT=8787                      (optional)
 *
 * Run:  node remap/dev-proxy.mjs
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** key → n8n webhook path. Dashboard workflows only (reads, and writes the contract allows).
 * Anything that sends, pays, books, revokes or returns file bytes must never appear here. */
export const ALLOW = {
  // reads
  calendar: "jstack-dash-calendar-read",
  tasks: "jstack-dash-tasks-read",
  people: "jstack-dash-people-read",
  files: "jstack-dash-files-list",
  memory: "jstack-memory-search",            // existing workflow, used as is (Brain › Find)
  // writes the contract allows (never send, pay, book or revoke)
  "tasks-write": "jstack-dash-tasks-write",
  "calendar-edit": "jstack-dash-calendar-edit",
  "gmail-draft": "jstack-dash-gmail-draft",  // drafts only
  records: "jstack-dash-records",
  actions: "jstack-dash-actions",
};

// the originals that send or return file bytes; their DASH copies are fine
const FORBIDDEN = /^jstack-(calendar-create|gmail-compose|gmail-reply|send-or-queue|dropbox-fetch)$/i;
for (const [k, p] of Object.entries(ALLOW)) {
  if (FORBIDDEN.test(p)) throw new Error(`dev-proxy: "${k}" → "${p}" sends or returns file bytes; it may not be exposed`);
}

function loadEnv() {
  const file = join(dirname(fileURLToPath(import.meta.url)), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const MAX_BODY = 16 * 1024;
const TIMEOUT_MS = 20_000;
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && LOOPBACK_ORIGIN.test(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-max-age", "600");
  }
}

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

export function createProxy({ base, header, value, fetchImpl = fetch, log = console.log }) {
  return createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    const m = (req.url || "").split("?")[0].match(/^\/n8n\/([a-z0-9-]+)$/);
    const target = m && ALLOW[m[1]];
    if (!target) return send(res, 404, { ok: false, error: { code: "NOT_ALLOWED", message: "unknown dashboard route" } });
    if (req.method !== "POST") return send(res, 405, { ok: false, error: { code: "METHOD", message: "POST only" } });

    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) return send(res, 413, { ok: false, error: { code: "TOO_LARGE", message: "body too large" } });
      chunks.push(c);
    }
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const up = await fetchImpl(`${base}/webhook/${target}`, {
        method: "POST",
        headers: { "content-type": "application/json", [header]: value },
        body: Buffer.concat(chunks).toString("utf8") || "{}",
        signal: ctrl.signal,
      });
      const text = await up.text();
      // status, key and duration only: bodies carry Josh's personal data
      log(`${new Date().toISOString()} ${m[1]} → ${up.status} ${Date.now() - started}ms`);
      res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/json" });
      res.end(text);
    } catch (e) {
      log(`${new Date().toISOString()} ${m[1]} → failed ${Date.now() - started}ms (${ctrl.signal.aborted ? "timeout" : "network"})`);
      send(res, 502, { ok: false, error: { code: ctrl.signal.aborted ? "TIMEOUT" : "UPSTREAM_UNREACHABLE", message: "n8n did not answer" } });
    } finally {
      clearTimeout(timer);
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadEnv();
  const { N8N_BASE, N8N_AUTH_HEADER, N8N_AUTH_VALUE, PROXY_PORT = "8787" } = process.env;
  if (!N8N_BASE || !N8N_AUTH_HEADER || !N8N_AUTH_VALUE) {
    console.error("dev-proxy: set N8N_BASE, N8N_AUTH_HEADER and N8N_AUTH_VALUE (remap/.env.local)");
    process.exit(1);
  }
  createProxy({ base: N8N_BASE.replace(/\/$/, ""), header: N8N_AUTH_HEADER, value: N8N_AUTH_VALUE })
    .listen(Number(PROXY_PORT), "127.0.0.1", () => {
      console.log(`dev-proxy on http://127.0.0.1:${PROXY_PORT}/n8n/{${Object.keys(ALLOW).join(",")}} → ${N8N_BASE}`);
    });
}
