#!/usr/bin/env node
/**
 * Q1 (ADR-19, "first cut" — W-1 in Stage 3b adds openapi.yaml and
 * WIRING.html): generates `wiring.json` and `WIRING.md` from `data/routes.ts`
 * and the source tree — endpoint → adapter method → marker → store actions
 * that call it → registry sections whose component (transitively) uses that
 * store → testIDs on those components. Acceptance-ID linking is a best-effort
 * text match against `02_ACCEPTANCE_TESTS_v2.md`/`_v21.md`'s "Where" column
 * (named here, not re-derived at every generation, because it can produce
 * false positives on a common word — read as a lead, not a guarantee).
 *
 * Run with no args to write `wiring.json` and `WIRING.md`; run with
 * `--out <dir>` to write elsewhere (tests/unit/wiring.test.ts regenerates
 * into a temp dir and diffs against the committed files, WM-01).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRoutesFrom } from "./read-routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const outArgIdx = process.argv.indexOf("--out");
const OUT_DIR = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : ROOT;

function readText(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function allFiles(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allFiles(p, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(p);
  }
  return out;
}

// ── 1. Parse data/routes.ts's ROUTES array (a plain-text parse — routes.ts
//    is data, not logic, so a regex over its object-literal rows is exact
//    for the fields wiring.json needs, without importing TS at build time). ──
function parseRoutes() {
  // one reader, shared with gen-openapi and validate-openapi. This function
  // used to carry its own regex, which required `handler` and `group` to be
  // adjacent; W-1 put two columns between them and the map silently went
  // empty (B-15, v2.1).
  return readRoutesFrom(join(ROOT, "data", "routes.ts"));
}

// ── 2. Every store action that calls each adapter method, by scanning
//    stores/*.ts with a brace-depth state machine over its top-level
//    `actionName: (args) => { ... }` / `actionName: async (args) => { ... }`
//    properties (the one shape every store in this app uses). ──────────────
function parseStoreActions() {
  const byMethod = new Map(); // method name -> [{ store, action }]
  const storeFiles = allFiles(join(ROOT, "stores"), [".ts"]).filter((f) => !f.endsWith(".test.ts"));
  for (const file of storeFiles) {
    const store = file.split(/[\\/]/).pop().replace(/\.ts$/, "");
    const lines = readFileSync(file, "utf8").split("\n");
    const actionHeader = /^\s{2}(\w+):\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{?/;
    let i = 0;
    while (i < lines.length) {
      const header = actionHeader.exec(lines[i]);
      if (header == null) {
        i++;
        continue;
      }
      const actionName = header[1];
      let depth = (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
      const bodyLines = [lines[i]];
      let j = i + 1;
      while (j < lines.length && depth > 0) {
        depth += (lines[j].match(/\{/g) ?? []).length - (lines[j].match(/\}/g) ?? []).length;
        bodyLines.push(lines[j]);
        j++;
      }
      const bodyText = bodyLines.join("\n");
      const hasAdapterAlias = /const\s+adapter\s*=\s*getAdapter\(\)/.test(bodyText);
      const calls = new Set();
      // `\s*` before the dot is load-bearing (T2-1, LV-02). Prettier wraps a
      // chained call over two lines — `await getAdapter()\n  .getParameters()`
      // — and a dot-hugging pattern cannot see it, so the method was reported
      // as having zero callers because of how it was FORMATTED. That turned
      // the orphan list, which LV-02 leans on, into a list of line breaks.
      for (const mm of bodyText.matchAll(/getAdapter\(\)\s*\.\s*(\w+)\(/g)) calls.add(mm[1]);
      if (hasAdapterAlias) for (const mm of bodyText.matchAll(/\badapter\s*\.\s*(\w+)\(/g)) calls.add(mm[1]);
      for (const method of calls) {
        const list = byMethod.get(method) ?? [];
        list.push(`${store}.${actionName}`);
        byMethod.set(method, list);
      }
      i = j;
    }
  }
  return byMethod;
}

// ── 3. Registry sections: id, tab, and the component names its `render`
//    mounts (from layout/registry.tsx's SECTIONS array, one entry per
//    section — some mount more than one component, e.g. "stats"). ─────────
function parseSections() {
  const src = readText("layout/registry.tsx");
  const body = src.slice(src.indexOf("export const SECTIONS"), src.indexOf("\n];\n"));
  const entries = [];
  // Split on the top-level `{ id: "..."` boundaries rather than a single
  // regex over the whole (multi-line, some entries span several lines)
  // array — { id: "x", ... render: () => (...) } isn't reliably one line.
  const starts = [...body.matchAll(/\{\s*\n?\s*id:\s*"([^"]+)"/g)];
  for (let k = 0; k < starts.length; k++) {
    const id = starts[k][1];
    const start = starts[k].index;
    const end = k + 1 < starts.length ? starts[k + 1].index : body.length;
    const chunk = body.slice(start, end);
    const tab = /tab:\s*"([^"]+)"/.exec(chunk)?.[1] ?? "unknown";
    const title = /title:\s*"([^"]+)"/.exec(chunk)?.[1] ?? id;
    const components = [...new Set([...chunk.matchAll(/<([A-Z]\w+)/g)].map((m) => m[1]))];
    entries.push({ id, tab, title, components });
  }
  return entries;
}

// ── 4. What a component and everything it locally renders contain, once: a
//    registry entry only names the TOP section component (e.g. `NeedsYou`),
//    but the store action a route calls is usually made by a CHILD it
//    renders (`NeedsYou` → `DecisionCard` → `.answer`) — so this follows
//    every local `@/components/...` import transitively (cycle-safe) and
//    unions their stores, exact action-name property accesses (`.actionName`,
//    the real attribution — two components can read the same store for
//    different actions) and testIDs. ────────────────────────────────────────
const ALL_TSX = allFiles(join(ROOT, "components"), [".tsx"]);
function fileForComponent(name) {
  return ALL_TSX.find((f) => f.endsWith(`${name}.tsx`)) ?? null;
}

function componentInfoFrom(componentName, visited = new Set()) {
  const file = fileForComponent(componentName);
  if (file == null || visited.has(file)) return { file: file?.slice(ROOT.length + 1).replaceAll("\\", "/") ?? null, stores: [], actionRefs: new Set(), testIds: [] };
  visited.add(file);
  const text = readFileSync(file, "utf8");
  const stores = new Set([...text.matchAll(/use(\w+)Store\(/g)].map((m) => m[1].charAt(0).toLowerCase() + m[1].slice(1)));
  const actionRefs = new Set([...text.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]));
  const testIds = new Set([...text.matchAll(/testID=\{?`?"?([a-zA-Z0-9-]+)/g)].map((m) => m[1]).filter((t) => t.length > 1));
  const localImports = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*"@\/components\/[^"]+"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(" as ")[0].trim()));
  for (const child of localImports) {
    const sub = componentInfoFrom(child, visited);
    for (const s of sub.stores) stores.add(s);
    for (const a of sub.actionRefs) actionRefs.add(a);
    for (const t of sub.testIds) testIds.add(t);
  }
  return { file: file.slice(ROOT.length + 1).replaceAll("\\", "/"), stores: [...stores], actionRefs, testIds: [...testIds] };
}

// ── 5. Best-effort acceptance-ID lead: does an ID's "Where" cell mention
//    this component's name or file? Read as a lead (a human/W-1 confirms),
//    not a guarantee — a common word in a "Where" cell can false-positive. ─
function parseAcceptanceWhere() {
  const rows = [];
  for (const doc of ["02_ACCEPTANCE_TESTS_v2.md", "02_ACCEPTANCE_TESTS_v21.md"]) {
    const text = readFileSync(join(ROOT, "..", doc), "utf8");
    for (const m of text.matchAll(/^\|\s*([A-Z]{2,3}-\d{2})\s*\|\s*([^|]+?)\s*\|/gm)) {
      rows.push({ id: m[1], where: m[2] });
    }
  }
  return rows;
}

/** `02_ACCEPTANCE_TESTS_v2.md`'s classic IDs (DC, TD, CG, TK, BR, LF, AG, SE, AR, GL, …) name
 * a screen/section in prose ("Today › Needs you"); the newer V2.1 IDs (SM, WM, TZ, …) name a
 * file or path instead. A lead matches either: the section's own registry `title`, or the
 * component's class name / file basename. */
function acceptanceIdsFor(leads, whereRows) {
  const ids = new Set();
  for (const row of whereRows) {
    if (leads.some((lead) => lead.length > 2 && row.where.includes(lead))) ids.add(row.id);
  }
  return [...ids].sort();
}

function buildWiring() {
  const routes = parseRoutes();
  const storeActions = parseStoreActions();
  const sections = parseSections();
  const whereRows = parseAcceptanceWhere();

  // component -> { file, stores, actionRefs, testIds } memoised, computed once
  const componentInfo = new Map();
  const infoFor = (name) => {
    if (!componentInfo.has(name)) componentInfo.set(name, componentInfoFrom(name));
    return componentInfo.get(name);
  };

  const orphanRoutes = [];
  const wiring = routes.map((r) => {
    const actions = storeActions.get(r.name) ?? [];
    const actionStores = [...new Set(actions.map((a) => a.split(".")[0]))];
    const actionNames = [...new Set(actions.map((a) => a.split(".")[1]))];
    // A component "uses" this route if it reads one of the calling stores
    // AND references at least one of the specific actions that call it —
    // the store-name-only match alone produced false positives (two
    // components on the same store, different actions, both attributed to
    // every route either one called).
    const usesActionStore = (c) => {
      const info = infoFor(c);
      return actionStores.some((st) => info.stores.includes(st)) && actionNames.some((a) => info.actionRefs.has(a));
    };
    const usingSections = sections.filter((s) => s.components.some(usesActionStore));
    const components = [...new Set(usingSections.flatMap((s) => s.components).filter(usesActionStore))];
    const testIds = [...new Set(components.flatMap((c) => infoFor(c).testIds))];
    const leads = [...usingSections.map((s) => s.title), ...components, ...components.map((c) => infoFor(c).file?.split("/").pop()).filter(Boolean)];
    const acceptanceIds = acceptanceIdsFor(leads, whereRows);
    if (actions.length === 0) orphanRoutes.push(r.name);
    return {
      name: r.name,
      method: r.method,
      path: r.path,
      marker: r.marker,
      handler: r.handler,
      group: r.group,
      storeActions: actions.sort(),
      sections: usingSections.map((s) => s.id),
      components,
      testIds: testIds.sort(),
      acceptanceIds,
    };
  });

  return { generatedNote: "gen-wiring.mjs first cut (Q1) — store/section/component links are a source-scan heuristic; acceptance IDs are a text-match lead, not a guarantee", routes: wiring, orphans: orphanRoutes };
}

function writeMarkdown(data) {
  const lines = [
    "# WIRING.md — endpoint to screen, generated",
    "",
    "Generated by `tools/gen-wiring.mjs` from `data/routes.ts` and a source scan (Q1, first cut —",
    "`openapi.yaml` and the Mermaid `WIRING.html` are Stage 3b's `W-1`). Do not hand-edit; run",
    "`node tools/gen-wiring.mjs`. Store/section/component links are found by scanning source for",
    "`getAdapter().<method>(` call sites and `use<Store>Store(` hook calls — a real scan, not a",
    "guess, but a component that reads a store WITHOUT calling the hook by that exact name (none",
    "do today) would not be found. Acceptance IDs are a best-effort text match against the",
    '"Where" column of `02_ACCEPTANCE_TESTS_v2.md`/`_v21.md` — a lead to check, not a guarantee.',
    "",
  ];
  let currentGroup = null;
  for (const r of data.routes) {
    if (r.group !== currentGroup) {
      currentGroup = r.group;
      lines.push(`## ${currentGroup}`, "");
    }
    lines.push(`### \`${r.method} ${r.path}\` — \`${r.name}\` (${r.marker})`);
    lines.push(`- handler: \`${r.handler}\``);
    lines.push(`- store actions: ${r.storeActions.length > 0 ? r.storeActions.map((a) => `\`${a}\``).join(", ") : "_none found — orphan_"}`);
    lines.push(`- sections: ${r.sections.length > 0 ? r.sections.map((s) => `\`${s}\``).join(", ") : "—"}`);
    lines.push(`- components: ${r.components.length > 0 ? r.components.join(", ") : "—"}`);
    lines.push(`- testIDs: ${r.testIds.length > 0 ? r.testIds.map((t) => `\`${t}\``).join(", ") : "—"}`);
    lines.push(`- acceptance IDs (lead): ${r.acceptanceIds.length > 0 ? r.acceptanceIds.join(", ") : "—"}`);
    lines.push("");
  }
  if (data.orphans.length > 0) {
    lines.push("## Orphans", "", "Routes with no store action found calling them:", "");
    for (const o of data.orphans) lines.push(`- \`${o}\``);
    lines.push("");
  }
  return lines.join("\n");
}

const data = buildWiring();
writeFileSync(join(OUT_DIR, "wiring.json"), JSON.stringify(data, null, 2) + "\n");
writeFileSync(join(OUT_DIR, "WIRING.md"), writeMarkdown(data));
console.log(`wiring.json and WIRING.md written: ${data.routes.length} routes, ${data.orphans.length} orphans`);
