#!/usr/bin/env node
// tools/orphan-callers.mjs — LV-02's second half (row T2-1).
//
// `wiring.json`'s `orphans` list means one precise thing: no STORE ACTION calls
// this adapter method. That is the map's own definition and it is a useful one,
// because a route reached only from a component bypasses the store's cache,
// its optimistic update and its queue handling.
//
// It is NOT the same claim as "nothing calls this route", and LV-02 is written
// against the second: "the wiring map's zero-caller list is empty or every entry
// is named in KNOWN_GAPS.md". Reading the first as the second would send routes
// to KNOWN_GAPS.md that are called perfectly well from a detail component, and
// would hide the ones that genuinely have no caller at all inside the noise.
//
// So this splits the orphan list in two:
//   COMPONENT-CALLED — a real caller outside the definition sites. Not a gap;
//                      a note for whoever wonders why it has no store action.
//   UNCALLED         — nothing anywhere. These are the KNOWN_GAPS.md rows.
//
// Definition sites are excluded by path: the adapter itself declares every
// method, the mock handlers define same-named functions, and the routes table
// names them all — none of those three is a caller.
//
// Usage:  node tools/orphan-callers.mjs [--json]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const asJson = process.argv.includes("--json");
const ROOT = ".";
const SEARCH_DIRS = ["app", "components", "layout", "lib", "stores", "data"];

// A file that DECLARES these methods rather than calling them.
const DEFINITION = [
  /^data\/ApiAdapter\.ts$/,
  /^data\/routes\.ts$/,
  /^data\/mock\/handlers\//,
  /^data\/mock\/server\.ts$/,
  /^data\/DataProvider\.tsx?$/,
  /^data\/transport\//,
];

// A caller that is not production code: it proves the method is reachable from
// the rig, not that the app uses it. Reported apart so neither is smuggled in.
const RIG = [/^lib\/testHook\.ts$/, /^tools\//];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === ".git") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const wiring = JSON.parse(readFileSync(join(ROOT, "wiring.json"), "utf8"));
const orphans = wiring.orphans;

const files = SEARCH_DIRS.flatMap((d) => walk(join(ROOT, d)));
const sources = files.map((f) => ({
  path: relative(ROOT, f).split(sep).join("/"),
  text: readFileSync(f, "utf8"),
}));

const rows = orphans.map((method) => {
  // `.method(` — a call, not the declaration `method(req)` in a handler.
  const re = new RegExp(`\\.\\s*${method}\\s*\\(`);
  const hits = sources.filter((s) => re.test(s.text)).map((s) => s.path);
  const real = hits.filter((p) => !DEFINITION.some((d) => d.test(p)) && !RIG.some((r) => r.test(p)));
  const rig = hits.filter((p) => RIG.some((r) => r.test(p)));
  return { method, callers: real, rigOnly: rig, state: real.length > 0 ? "component-called" : rig.length > 0 ? "rig-only" : "uncalled" };
});

const componentCalled = rows.filter((r) => r.state === "component-called");
const rigOnly = rows.filter((r) => r.state === "rig-only");
const uncalled = rows.filter((r) => r.state === "uncalled");

if (asJson) {
  console.log(JSON.stringify({ orphans: orphans.length, componentCalled, rigOnly, uncalled }, null, 2));
} else {
  console.log(`wiring.json orphans (no store action): ${orphans.length}`);
  console.log(`  component-called (a real caller, no store action): ${componentCalled.length}`);
  for (const r of componentCalled) console.log(`    ${r.method}  <- ${r.callers.join(", ")}`);
  console.log(`  rig-only (only lib/testHook.ts or tools/): ${rigOnly.length}`);
  for (const r of rigOnly) console.log(`    ${r.method}  <- ${r.rigOnly.join(", ")}`);
  console.log(`  UNCALLED anywhere — these are the KNOWN_GAPS.md rows: ${uncalled.length}`);
  for (const r of uncalled) console.log(`    ${r.method}`);
}
