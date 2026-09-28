/**
 * `WIRING.html` — the wiring map as a picture, one diagram per contract
 * section (W-1, WM-02), generated from `wiring.json`.
 *
 * The file has to open from disk with no network and no dependency, which
 * rules out loading Mermaid at runtime. `14_CC_V21_EXEC_PROMPT.md` offers two
 * ways out: render static SVG with a small layout routine of our own, or emit
 * Mermaid source in `<pre>` blocks with a note. This does the first, because a
 * picture you have to paste into another tool to see is not a picture — and
 * keeps the Mermaid source in a `<details>` beside each diagram anyway, so the
 * same section can be pasted into a doc that does render it.
 *
 * The layout is deliberately dumb: three columns (endpoint → store action →
 * component), each column a stack, edges as cubic curves between them. No
 * crossing minimisation, no force simulation — with at most two dozen nodes a
 * section, a stable and predictable arrangement beats a prettier unstable one,
 * and stability is what makes the file's diff readable.
 *
 * The drift test covers `wiring.json`, not the picture (WM-01); WM-02 checks
 * this file renders one diagram per section and asks for nothing off-machine.
 *
 * Run: `node tools/gen-wiring-html.mjs` (or `pnpm codemap`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const escapeXml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const truncate = (s, max) => (s.length <= max ? s : s.slice(0, max - 1) + "…");

// ─── layout ─────────────────────────────────────────────────────────────

const COL = [
  { x: 16, w: 250, key: "endpoint" },
  { x: 226 + 120, w: 210, key: "action" },
  { x: 226 + 120 + 250, w: 210, key: "component" },
];
const ROW_H = 30;
const NODE_H = 22;
const TOP = 34;

function layout(columns) {
  const nodes = [];
  columns.forEach((items, ci) => {
    const spec = COL[ci];
    items.forEach((label, ri) => {
      nodes.push({
        id: `${ci}:${label}`,
        label,
        x: spec.x,
        y: TOP + ri * ROW_H,
        w: spec.w,
        h: NODE_H,
        column: ci,
      });
    });
  });
  const height = TOP + Math.max(1, ...columns.map((c) => c.length)) * ROW_H + 12;
  const width = COL[2].x + COL[2].w + 16;
  return { nodes, width, height };
}

function edgePath(from, to) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const mid = x1 + (x2 - x1) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

function svgFor(group, routes) {
  const endpoints = routes.map((r) => `${r.method} ${r.path}`);
  const actions = [...new Set(routes.flatMap((r) => r.storeActions))].sort(byName);
  const components = [...new Set(routes.flatMap((r) => r.components))].sort(byName);
  const { nodes, width, height } = layout([endpoints, actions, components]);
  const at = new Map(nodes.map((n) => [n.id, n]));

  const edges = new Set();
  for (const route of routes) {
    const from = at.get(`0:${route.method} ${route.path}`);
    if (from == null) continue;
    if (route.storeActions.length === 0) {
      for (const component of route.components) edges.add(JSON.stringify([from.id, `2:${component}`]));
      continue;
    }
    for (const action of route.storeActions) {
      edges.add(JSON.stringify([from.id, `1:${action}`]));
      for (const component of route.components) edges.add(JSON.stringify([`1:${action}`, `2:${component}`]));
    }
  }

  const parts = [`<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeXml(group)} wiring">`];
  parts.push(`<title>${escapeXml(group)}: endpoint to store action to component</title>`);
  for (const [x, label] of [
    [COL[0].x, "endpoint"],
    [COL[1].x, "store action"],
    [COL[2].x, "component"],
  ]) {
    parts.push(`<text class="head" x="${x}" y="20">${label}</text>`);
  }
  for (const raw of [...edges].sort(byName)) {
    const [fromId, toId] = JSON.parse(raw);
    const from = at.get(fromId);
    const to = at.get(toId);
    if (from == null || to == null) continue;
    parts.push(`<path class="edge" d="${edgePath(from, to)}" />`);
  }
  for (const node of nodes) {
    const cls = ["node", `c${node.column}`].join(" ");
    parts.push(`<rect class="${cls}" x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="5" />`);
    parts.push(
      `<text class="label" x="${node.x + 8}" y="${node.y + 15}">${escapeXml(truncate(node.label, Math.floor(node.w / 6.2)))}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function mermaidFor(group, routes) {
  const id = (s) => "n" + Buffer.from(s).toString("hex").slice(0, 12);
  const lines = ["flowchart LR"];
  const seen = new Set();
  const node = (key, label) => {
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(`  ${id(key)}["${label.replace(/"/g, "'")}"]`);
  };
  for (const route of routes) {
    const endpoint = `${route.method} ${route.path}`;
    node(`0:${endpoint}`, endpoint);
    for (const action of route.storeActions) node(`1:${action}`, action);
    for (const component of route.components) node(`2:${component}`, component);
  }
  const edges = new Set();
  for (const route of routes) {
    const endpoint = `0:${route.method} ${route.path}`;
    if (route.storeActions.length === 0) {
      for (const component of route.components) edges.add(`  ${id(endpoint)} --> ${id(`2:${component}`)}`);
      continue;
    }
    for (const action of route.storeActions) {
      edges.add(`  ${id(endpoint)} --> ${id(`1:${action}`)}`);
      for (const component of route.components) edges.add(`  ${id(`1:${action}`)} --> ${id(`2:${component}`)}`);
    }
  }
  lines.push(...[...edges].sort(byName));
  return lines.join("\n");
}

// ─── the page ───────────────────────────────────────────────────────────

const STYLE = `
:root { color-scheme: light dark; --ink:#16181d; --muted:#5c6270; --line:#d7dae1; --bg:#fbfbfd; --panel:#fff;
        --c0:#e8effb; --c0s:#7d9ad4; --c1:#eaf5ec; --c1s:#79ac86; --c2:#faf0e6; --c2s:#c79c66; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e9ecf2; --muted:#9aa1b1; --line:#333844; --bg:#14161b; --panel:#1a1d24;
          --c0:#1e2a3f; --c0s:#5d7cb5; --c1:#1d2a21; --c1s:#5c8e6a; --c2:#2e2519; --c2s:#a17f4c; }
}
* { box-sizing: border-box; }
body { margin:0; padding:24px; background:var(--bg); color:var(--ink);
       font:14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size:20px; margin:0 0 4px; }
h2 { font-size:16px; margin:0 0 8px; text-transform:capitalize; }
p.note { color:var(--muted); margin:0 0 20px; max-width:62ch; }
section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:0 0 16px; }
.meta { color:var(--muted); font-size:12px; margin:0 0 10px; }
svg { display:block; overflow:visible; }
text { font:12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; fill:var(--ink); }
text.head { font-size:11px; fill:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
.edge { fill:none; stroke:var(--line); stroke-width:1.2; }
.node { stroke-width:1; }
.node.c0 { fill:var(--c0); stroke:var(--c0s); }
.node.c1 { fill:var(--c1); stroke:var(--c1s); }
.node.c2 { fill:var(--c2); stroke:var(--c2s); }
details { margin-top:10px; }
summary { cursor:pointer; color:var(--muted); font-size:12px; }
pre { overflow-x:auto; background:var(--bg); border:1px solid var(--line); border-radius:6px;
      padding:10px; font:12px/1.45 ui-monospace, Menlo, Consolas, monospace; }
ul.orphans { margin:6px 0 0; padding-left:18px; color:var(--muted); font-size:12px; }
`;

function buildHtml(wiring) {
  const groups = new Map();
  for (const route of wiring.routes) {
    if (!groups.has(route.group)) groups.set(route.group, []);
    groups.get(route.group).push(route);
  }

  const sections = [];
  for (const group of [...groups.keys()].sort(byName)) {
    const routes = [...groups.get(group)].sort((a, b) => byName(a.path, b.path) || byName(a.method, b.method));
    const orphans = routes.filter((r) => r.storeActions.length === 0 && r.components.length === 0);
    sections.push(
      [
        `<section id="${escapeXml(group)}">`,
        `<h2>${escapeXml(group)}</h2>`,
        `<p class="meta">${routes.length} endpoint${routes.length === 1 ? "" : "s"} · ` +
          `${new Set(routes.flatMap((r) => r.storeActions)).size} store action(s) · ` +
          `${new Set(routes.flatMap((r) => r.components)).size} component(s)</p>`,
        svgFor(group, routes),
        orphans.length
          ? `<ul class="orphans">${orphans
              .map((r) => `<li>${escapeXml(`${r.method} ${r.path}`)} — no client caller traced</li>`)
              .join("")}</ul>`
          : "",
        `<details><summary>Mermaid source for this section</summary><pre>${escapeXml(mermaidFor(group, routes))}</pre></details>`,
        "</section>",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>JSTACK · WIRING</title>",
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    "<h1>JSTACK wiring map</h1>",
    '<p class="note">One diagram per contract section: which endpoint feeds which store action, and which ' +
      "component reads it. Generated from <code>wiring.json</code> by <code>tools/gen-wiring-html.mjs</code> — " +
      "do not hand-edit. Every diagram is inline SVG and this page loads nothing from the network, so it opens " +
      "from disk on a machine with no connection.</p>",
    ...sections,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function generate(outPath = join(root, "WIRING.html")) {
  const wiring = JSON.parse(readFileSync(join(root, "wiring.json"), "utf8"));
  const html = buildHtml(wiring);
  writeFileSync(outPath, html.split("\r\n").join("\n"));
  return { groups: new Set(wiring.routes.map((r) => r.group)).size, routes: wiring.routes.length };
}

if (process.argv[1] && process.argv[1].endsWith("gen-wiring-html.mjs")) {
  const i = process.argv.indexOf("--out");
  const { groups, routes } = generate(i === -1 ? join(root, "WIRING.html") : process.argv[i + 1]);
  console.log(`WIRING.html written: ${groups} sections, ${routes} routes`);
}
