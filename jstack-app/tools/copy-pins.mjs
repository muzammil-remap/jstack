#!/usr/bin/env node
// tools/copy-pins.mjs — count the literal copy pins in e2e/ (row T2-1, hard rule 7).
//
// A COPY PIN is an assertion that matches user-facing WORDS by literal string:
// the visible-text matchers and the accessible-name matchers. It is what breaks
// when a sentence is reworded, and hard rule 7 says these are not sacred — a row
// that changes a sentence which is not itself an acceptance ID records the change
// in 02_ACCEPTANCE_TESTS_v22.md §4 and moves the assertion to a testID or a role.
//
// TWO SPLITS, because one alone misleads.
//
// (1) ASSERTED vs LOCATOR. toHaveText/toContainText ASSERT the words. getByText,
// getByRole({name}), getByLabel, getByPlaceholder, getByTitle, getByAltText USE
// the words to find an element. Both break on a rewording, but only the first is
// a "text assertion" in hard rule 7's sense, so they are reported apart.
//
// (2) PROMISED vs FREE, and this is the split the Fable pass needs. A pin is
// PROMISED when its literal appears verbatim in one of the three acceptance packs
// — the sentence is what an ID guarantees, so rewording it needs a §4 row first.
// A FREE pin quotes prose no acceptance ID promises: it may move to a testID or a
// role without ceremony. Enclosing-describe IDs were tried as the test for this
// and rejected: they marked 462 of 476 pins tied, because nearly every describe
// names an ID while the sentences inside it are mostly incidental prose.
//
// Regex matchers (getByText(/…/)) are counted SEPARATELY. They pin a shape rather
// than a sentence, so they survive a rewording that a literal would not.
//
// Usage:  node tools/copy-pins.mjs [--json] [--list-free] [--root e2e]
// Exit code is always 0: this is a measurement, not a gate.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const listFree = args.includes("--list-free");
const rootArg = args.indexOf("--root");
const ROOT = rootArg === -1 ? "e2e" : args[rootArg + 1];

// The three acceptance packs, read once. A pin whose literal appears verbatim in
// any of them is PROMISED by an ID: its sentence is the spec, not incidental prose.
const PACKS = [
  "../02_ACCEPTANCE_TESTS_v2.md",
  "../02_ACCEPTANCE_TESTS_v21.md",
  "../02_ACCEPTANCE_TESTS_v22.md",
];
const packText = PACKS.map((p) => {
  try { return readFileSync(p, "utf8"); } catch { return ""; }
}).join("\n");
if (!packText.trim()) {
  console.error("copy-pins: the acceptance packs are unreadable from here — run from jstack-app/");
  process.exit(2);
}

// Matched against the packs case-sensitively and whole: a fragment of one word is
// not a promise. Pins under three characters are too short to carry a sentence.
function isPromised(text) {
  const t = text.trim();
  if (t.length < 3) return false;
  return packText.includes(t);
}

// The matchers that compare against WORDS. Each entry is [name, regex, kind] where
// the regex captures the literal in group 2. Written with explicit quote classes so
// a string containing the other quote style is still captured whole.
const ASSERT = "asserted";
const LOCATE = "locator";
const LITERAL_MATCHERS = [
  ["getByText", /\.getByText\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, LOCATE],
  ["getByRole name", /\bname:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, LOCATE],
  ["getByLabel", /\.getByLabel\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, LOCATE],
  ["getByPlaceholder", /\.getByPlaceholder\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, LOCATE],
  ["getByTitle", /\.getByTitle\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, LOCATE],
  ["getByAltText", /\.getByAltText\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, LOCATE],
  ["toHaveText", /\.toHaveText\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, ASSERT],
  ["toContainText", /\.toContainText\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, ASSERT],
];

const REGEX_MATCHERS = [
  ["getByText re", /\.getByText\(\s*\//g],
  ["toHaveText re", /\.toHaveText\(\s*\//g],
  ["toContainText re", /\.toContainText\(\s*\//g],
  ["getByRole name re", /\bname:\s*\//g],
];

const DESCRIBE = /\btest\.describe(?:\.\w+)?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/;
const TEST = /\btest(?:\.\w+)?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

// Strip line comments and string bodies so brace counting is not fooled by a `{`
// inside a sentence. Keeps the line length stable so column numbers stay usable.
function maskLine(line) {
  let out = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") { out += "  "; i++; continue; }
      if (ch === quote) { quote = null; out += ch; continue; }
      out += " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; out += ch; continue; }
    if (ch === "/" && line[i + 1] === "/") { out += " ".repeat(line.length - i); break; }
    out += ch;
  }
  return out;
}

const files = walk(ROOT).sort();
const pins = [];
const regexPins = [];

for (const file of files) {
  const rel = relative(".", file).split(sep).join("/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    for (const [name, re, kind] of LITERAL_MATCHERS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(raw)) !== null) {
        pins.push({ file: rel, line: i + 1, matcher: name, kind, text: m[2], promised: isPromised(m[2]) });
      }
    }
    for (const [name, re] of REGEX_MATCHERS) {
      re.lastIndex = 0;
      while (re.exec(raw) !== null) regexPins.push({ file: rel, line: i + 1, matcher: name });
    }
  }
}

const asserted = pins.filter((p) => p.kind === ASSERT);
const locators = pins.filter((p) => p.kind === LOCATE);
const promised = pins.filter((p) => p.promised);
const free = pins.filter((p) => !p.promised);

const byMatcher = {};
for (const p of pins) byMatcher[p.matcher] = (byMatcher[p.matcher] || 0) + 1;

const byFile = {};
for (const p of free) byFile[p.file] = (byFile[p.file] || 0) + 1;

const result = {
  root: ROOT,
  files: files.length,
  literalPins: pins.length,
  asserted: asserted.length,
  locators: locators.length,
  promised: promised.length,
  free: free.length,
  assertedFree: asserted.filter((p) => !p.promised).length,
  regexPins: regexPins.length,
  byMatcher,
  freeByFile: Object.fromEntries(Object.entries(byFile).sort((a, b) => b[1] - a[1])),
};

if (asJson) {
  console.log(JSON.stringify(listFree ? { ...result, freePins: free } : result, null, 2));
} else {
  console.log(`copy pins under ${ROOT}/ over ${files.length} files`);
  console.log(`  literal copy pins   ${result.literalPins}`);
  console.log(`    asserted          ${result.asserted}  (toHaveText / toContainText — hard rule 7's "text assertions")`);
  console.log(`    locator           ${result.locators}  (getByText / role name / label / placeholder / title / alt)`);
  console.log(`    promised by a pack${String(result.promised).padStart(6)}  (the literal appears verbatim in an acceptance pack)`);
  console.log(`    free to reword    ${result.free}  (of which asserted: ${result.assertedFree})`);
  console.log(`  regex text matchers ${result.regexPins}  (counted separately: they pin a shape, not a sentence)`);
  console.log(`  by matcher: ${Object.entries(byMatcher).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  free pins by file (top 10):`);
  for (const [f, n] of Object.entries(result.freeByFile).slice(0, 10)) console.log(`    ${n.toString().padStart(4)}  ${f}`);
  if (listFree) for (const p of free) console.log(`    ${p.file}:${p.line}  ${p.matcher}  ${JSON.stringify(p.text)}`);
}
