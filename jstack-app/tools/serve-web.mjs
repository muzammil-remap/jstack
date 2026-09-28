/**
 * Tiny static server for the Expo web export (dist/). No dependencies.
 * Single-output SPA: unknown paths fall back to index.html.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";

// export lives outside Dropbox (see build-web.mjs — BUGLOG B-7)
const root = process.env.JSTACK_DIST ?? join(homedir(), ".jstack-dist");
const port = Number(process.argv[2] ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  // P-1: without this the browser refuses the manifest as the wrong type and
  // the install prompt never appears — a PWA that is correct in every file
  // and not installable
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
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (path === "" || path === ".") path = "index.html";
    let body;
    let ext = extname(path).toLowerCase();
    try {
      body = await readFile(join(root, path));
    } catch {
      body = await readFile(join(root, "index.html"));
      ext = ".html";
    }
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(port, undefined /* dual-stack: localhost may resolve to ::1 (WebAuthn rig) */, () => {
  console.log(`serving dist/ on http://127.0.0.1:${port}`);
});
