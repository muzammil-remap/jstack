#!/usr/bin/env node
// tools/qa-rows.mjs — build QA_REPORT_v22.md §1's V2.2 rows FROM THE TREE (row T2-2).
//
// Why generated rather than typed: 190 rows typed by hand is 190 chances to name
// a test that does not exist, and that is not hypothetical — by round 7 of the V2
// audit, thirty-nine of a hundred and thirteen hand-written pointers in
// QA_REPORT_v2.md named a different test than their row claimed. Every evidence
// path this prints was found by searching for the ID, so it cannot name a file
// that does not quote it. `tests/unit/handover.test.ts` re-checks that property
// on the committed file.
//
// STATUS, and the rule is deliberately conservative:
//   PASS     — at least one test/spec file quotes the ID, and the board is green.
//              The board is what proves it passes; the citation is what says where.
//   STAGE 6  — the ID belongs to a stage that has not run (the ux loop, the
//              audit, the release, REMAP consolidation, the simplification pass).
//   PARTIAL  — nothing quotes it. Never silently PASS: an ID no test names is the
//              exact "claim without a gate" LV-08 is marked PARTIAL for.
//
// Usage:  node tools/qa-rows.mjs > rows.md

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP = ".";
const REPO = "..";

// Prefixes owned by a later stage. Their acceptance rows cannot be PASS at 5c.
// EMPTY at A-6, and that is the point: these named the stages that had not
// run. Stage 5d ran (`SIMPLIFICATION_v22.md`, 10 Sep), A-5 ran (`CONTRACT.md`,
// `HANDOVER.md`, `REMAP_READINESS.md`, the cold-start report), and the audit
// itself ran to eleven rounds plus A-6's invocation. Sixteen rows were still
// asserting "a stage that has not run" about work that had (the A-6 audit,
// D-4), which is a claim the report makes about itself — the worst kind to
// leave stale. A row with no test still falls through to PARTIAL below; it
// does not become PASS by this list emptying.
const STAGE_6_PREFIX = new Set([]);
// A-2 (Stage 6) took QA-07 and LV-09 out: the capture pass has run, and `tests/unit/handover.test.ts` quotes both.
const STAGE_6_IDS = new Set([]);

/**
 * A4R2-05: an ID whose behaviour is RECORDED as a deviation, with the reason.
 *
 * "A test quotes it" is what this tool can see, and it is not the same claim
 * as "the app does what the row says". LV-07 has tests quoting it and was
 * printed PASS in §1 while §2, §3 and `BUGLOG_v22.md` B-10 all called it a
 * DEVIATION — one report saying two things about one ID, which is the reader's
 * problem rather than the generator's convenience. Declared once here, so §1
 * says it and no hand-edit is needed (§1 is generated; never edit it in place).
 */
const DEVIATION_IDS = new Map([
  [
    "LV-07",
    "react-native-web 0.21 maps `accessibilityLabel` to `aria-label` and does NOT map `accessibilityState` (B-10), so a native-renderer test sees the prop and never the DOM; the `aria-*` prop is passed alongside and asserted as an ATTRIBUTE in an e2e instead",
  ],
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(spec|test)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

// tests/unit/qaReport22.test.ts is the test OF this report (QA-02): it names IDs in its own
// comments and lists, and a mention there is not a gate for that ID. Found at A-2, when a
// regeneration read LL-01 as PASS off a comment saying LL-01 must stay PARTIAL.
const files = [...walk(join(APP, "e2e")), ...walk(join(APP, "tests"))]
  .filter((f) => !f.endsWith("qaReport22.test.ts"))
  .map((f) => ({
  path: relative(APP, f).split(sep).join("/"),
  text: readFileSync(f, "utf8"),
}));

// §1's ID table: every row of every group table, up to §2 — AND §3's, which
// declares Josh's own JQ-01..06 and the CD-01..15 carried from V2.1, each with
// a written check.
//
// A4R2-05/A4R2-08: §3 was out of scope by construction, so twenty-one
// acceptance IDs had no status anywhere in a report whose own opening scopes it
// to "every V2, V2.1 and V2.2 acceptance ID" and which `CODEMAP.md` §1 names as
// the truth for what done means. They are IDs with checks; they get rows.
const acc = readFileSync(join(REPO, "02_ACCEPTANCE_TESTS_v22.md"), "utf8");
const part1 = acc.slice(0, acc.indexOf("## §2."));
const part3 = acc.slice(acc.indexOf("## §3."), acc.indexOf("## §4."));
const rows = [];
// The two tables have DIFFERENT shapes, and reading §3 with §1's regex
// produced malformed six-column rows whose columns had shifted: §1 is
// `| ID | where | check |` and §3 is `| ID | the line | screen | check | row |`
// (its headers say so). Split on the pipes and take the columns by name.
const collect = (part, whereAt, checkAt) => {
  for (const line of part.split("\n")) {
    if (!/^\| [A-Z][A-Z0-9]{1,3}-\d{2} \|/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ");
    if (cells.length <= Math.max(whereAt, checkAt)) continue;
    rows.push({ id: cells[0].trim(), where: cells[whereAt].trim(), check: cells[checkAt].trim() });
  }
};
collect(part1, 1, 2);
collect(part3, 2, 3);

const seen = new Set();
const out = [];
for (const r of rows) {
  if (seen.has(r.id)) continue;
  seen.add(r.id);

  const quoting = files.filter((f) => f.text.includes(r.id)).map((f) => f.path);
  const prefix = r.id.split("-")[0];
  const stage6 = STAGE_6_PREFIX.has(prefix) || STAGE_6_IDS.has(r.id);

  let status;
  let evidence;
  if (DEVIATION_IDS.has(r.id)) {
    // recorded, with the reason, rather than flattened to PASS because a test
    // happens to name the ID (A4R2-05)
    status = "DEVIATION";
    evidence = `${DEVIATION_IDS.get(r.id)}${quoting.length > 0 ? ` — ${quoting.slice(0, 2).map((p) => `\`${p}\``).join(", ")}` : ""}`;
  } else if (stage6) {
    status = "STAGE 6";
    evidence = quoting.length > 0 ? quoting.slice(0, 2).map((p) => `\`${p}\``).join(", ") : "`history/v1/19_CC_V22_AUDIT_PROMPT.md`";
  } else if (quoting.length > 0) {
    status = "PASS";
    evidence = quoting.slice(0, 3).map((p) => `\`${p}\``).join(", ");
  } else {
    // An UMBRELLA row: its check delegates to other acceptance IDs rather than
    // owning a test ("OP-07 covers Brain's rows", "every V2 and V2.1 BR/TM/OF
    // check still passes"). Its evidence is the delegate's tests. Marking these
    // PARTIAL would be as wrong as marking a genuinely ungated ID PASS — the
    // point of the split is that the reader can tell the two apart.
    const delegates = [...new Set([...r.check.matchAll(/\b([A-Z]{2,3}-\d{2})\b/g)].map((m) => m[1]))].filter((d) => d !== r.id);
    const viaFiles = [];
    for (const d of delegates) {
      const f = files.find((x) => x.text.includes(d));
      if (f) viaFiles.push(`\`${f.path}\` (via ${d})`);
    }
    if (viaFiles.length > 0) {
      status = "PASS";
      evidence = viaFiles.slice(0, 2).join(", ");
    } else {
      status = "PARTIAL";
      evidence = "no test file quotes this ID and its check names no delegate — see §1's note";
    }
  }

  const check = r.check.length > 190 ? r.check.slice(0, 187).replace(/\s+\S*$/, "") + "…" : r.check;
  out.push(`| ${r.id} | ${status} | ${check} | ${evidence} |`);
}

const counts = out.reduce((a, l) => {
  const s = l.split(" | ")[1];
  a[s] = (a[s] || 0) + 1;
  return a;
}, {});

console.error(`rows: ${out.length} — ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(out.join("\n"));
