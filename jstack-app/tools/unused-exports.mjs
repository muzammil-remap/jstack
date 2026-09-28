/**
 * Lists exports that nothing imports (S-6, CT-06).
 *
 * Dead exports are not merely untidy. An exported function reads as
 * supported: the next person wires a screen to it, and nobody has ever run
 * it. This build already paid for that twice — AUDIT_v2.md A-08 found nine
 * generated tokens with no consumer, three of them shadowed by hand-typed
 * copies of their own values, and S-6 found `data/labels.ts`'s entire rule
 * set unused while two mock handlers hand-wrote literals that matched it.
 *
 * Deliberately simple: a regex scan, no TypeScript program. It has to run
 * in a second inside a Jest test, and the question ("does this identifier
 * appear in an import anywhere else?") does not need a type checker. That
 * costs some precision — see the exclusions below, each of which is a
 * category the scan cannot judge rather than a case someone found awkward.
 *
 * Run: `node tools/unused-exports.mjs` (also `pnpm unused`). Exits 1 with a
 * list when anything is unused, which is what `tests/unit/unused-exports.test.ts`
 * asserts against.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Source we own. Spec and test FILES are readers, never subjects (see
 * `walk`), but the directories they live in are scanned so a shared helper
 * with no caller is found — `e2e/lib/sweeps.ts` had three such functions,
 * and the first version of this list left `e2e` out entirely, which is a
 * blind spot in a tool whose whole job is finding blind spots.
 */
const DIRS = ["app", "components", "data", "layout", "lib", "stores", "theme", "tools", "eslint-rules", "e2e"];

/**
 * Not scanned as subjects, each for a stated reason.
 *
 * - `theme/ui/` — the primitive library. Its whole purpose is to offer a
 *   vocabulary; an unused primitive is a gap in the app, not dead code, and
 *   `tests/unit/tokens.test.ts`'s DS-01b already guards the token half.
 * - generated files — they answer to their generator.
 * - barrels — a re-export exists to be re-exported.
 * - config and entry points — the framework imports these by convention,
 *   by filename, so no `import` statement names them anywhere.
 */
const EXCLUDE_SUBJECT = [
  /^theme\/ui\//,
  /\.generated\.tsx?$/,
  /(^|\/)index\.tsx?$/,
  /^theme\/ui\.tsx$/,
  // `data/types.ts` is the transport CONTRACT, not application code. Every
  // shape in it is something the backend must implement (CONTRACT_v21.md
  // §3); a type the client does not yet destructure is a feature not built,
  // not a dead export, and deleting one would delete the specification.
  // Same argument as `theme/ui/` above.
  /^data\/types\.ts$/,
  /^app\//, // expo-router resolves every route file by path
  /^eslint-rules\//, // resolved by string in eslint.config.js
  /\.config\.(js|ts|mjs)$/,
];

/**
 * Exports nothing imports that are NOT dead code, each with its reason.
 *
 * Keep this short, and keep every line honest. The point of the scan is to
 * find things nobody wired; an entry here says "nobody wired it AND that is
 * correct", which is a different claim and a rarer one. Two of the entries
 * below are the opposite — capabilities that SHOULD be wired and are not.
 * They are listed rather than deleted because deleting a security affordance
 * on the say-so of a regex is how a build loses one quietly; they are on
 * `NEEDS_JOSH.md` and belong to Stage 3c's `H-1`.
 */
const ALLOWED = new Map([
  ["data/mock/handlers", "modules resolved by name from data/routes.ts's handler column (S-1), never by import"],
  ["components/chrome/Sens.tsx → useSensRegistry", "the SEC-15 mount/blur registry — read by the runtime guard, not by an importer"],
  ["data/mock/util.ts → created", "the mock's 201 helper; kept beside noContent/nextId as the server's response vocabulary"],
  ["data/mock/util.ts → nextId", "same — the id generator every future handler will reach for"],
  ["data/mock/util.ts → noContent", "same — the 204 helper"],
  ["lib/mic.ts → __resetMicForTests", "a test seam; the double underscore is the convention that says so"],
  // tests/unit/workflows.test.ts imports these through a CHILD PROCESS
  // (`node --input-type=module -e "await import(...)"`), because Jest's
  // CommonJS transform will not take an ES module tool. There is no static
  // import for this scan to find, and there cannot be one.
  ["tools/audit-check.mjs → advisories", "imported by tests/unit/audit-check.test.ts in a child process, for the same reason — and it is exported precisely so the parser can be handed pnpm's real output and asked what it found (B-37)"],
  ["tools/workflow-yaml.mjs → parseWorkflow", "imported by tests/unit/workflows.test.ts in a child process; Jest cannot import an .mjs tool directly"],
  ["tools/sw-precache.mjs → precacheList", "imported by tests/unit/pwa.test.ts in a child process, same reason — CD-11 drives it over a synthetic export so the assertion needs no local build"],
  ["tools/workflow-yaml.mjs → runSteps", "same child-process import — the scan cannot see past a dynamic import in a spawned node"],
  ["theme/tokens.ts → iconNames", "generated from design/tokens.json by gen-tokens.mjs; the generator owns it"],
  ["theme/tokens.ts → ShadowToken", "generated too — gen-tokens.mjs rewrites this file, so un-exporting it here does not survive"],
  // These three are FALSE POSITIVES the scan cannot see past: they are lines
  // inside a template literal that a generator WRITES into its output file,
  // not exports of the generator module. Un-exporting them (as an earlier
  // pass of S-6 did) silently changed the generated files and broke DS-04.
  // A template-literal-aware scan would need a parser, which this
  // deliberately is not — so they are named here instead.
  ["tools/gen-tokens.mjs → iconNames", "written into theme/tokens.ts by this generator's template, not exported by it"],
  ["tools/gen-tokens.mjs → ShadowToken", "same — a line in the generated file's template"],
  ["tools/gen-icons.mjs → IconDef", "same — a line in components/chrome/icons.generated.ts's template"],
  ["tools/unused-exports.mjs → unusedExports", "imported by tests/unit/unused-exports.test.ts, which is this file's whole point"],
  ["layout/TabScreen.tsx → defaultOrderFor", "the fallback section order a tab uses before settings load; called through the registry"],

  // The contrast instrument. Nothing imports it because it is run to
  // MEASURE, not asserted against: it produced the numbers CD-07 quotes and
  // `design/DISCREPANCIES.md` records, and CD-07 is still open — Josh may
  // want the alert token re-measured. Deleting a measuring instrument
  // because no test currently reads it would make that question
  // unanswerable.
  ["e2e/lib/contrast.ts → MeasuredPair", "contrast instrument, run to measure (CD-07); see the note above"],
  ["e2e/lib/contrast.ts → composite", "same"],
  ["e2e/lib/contrast.ts → contrastRatio", "same"],
  ["e2e/lib/contrast.ts → measureContrast", "same"],
  ["e2e/lib/contrast.ts → parseColor", "same"],
  ["e2e/lib/contrast.ts → relativeLuminance", "same"],
  ["e2e/lib/sweeps.ts → INTERACTIVE_SELECTOR", "used by the two live sweeps in this file"],
  ["e2e/lib/sweeps.ts → SweepViolation", "the return type of every sweep in this file"],

  // --- not "correctly unused": genuinely unwired, and that is a finding ---
  ["lib/keyboard.ts → dismissKeyboard", "UNWIRED. Written for KB-03; no surface dismisses the keyboard explicitly yet"],
]);

function walk(dir, acc = [], includeTests = false) {
  let entries;
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    // B-41: `tests/unit/lint-guards.test.ts` plants and deletes fixtures under
    // `tests/lint-guard-scratch-*` while the board runs; they are not readers
    // of anything real, and walking one mid-deletion killed the tool (ENOENT)
    if (name.startsWith("lint-guard-scratch-")) continue;
    const rel = `${dir}/${name}`;
    let stat;
    try {
      stat = statSync(join(root, rel));
    } catch {
      continue; // gone between readdir and stat — a transient, not a subject
    }
    if (stat.isDirectory()) walk(rel, acc, includeTests);
    else if (/\.(ts|tsx|mjs)$/.test(name) && (includeTests || !/\.(spec|test)\.tsx?$/.test(name))) acc.push(rel);
  }
  return acc;
}

/** Every named export in a file. Default exports are excluded: they are
 * imported under an arbitrary local name, so the scan cannot follow them. */
function exportsOf(src) {
  const names = new Set();
  const add = (n) => n && n !== "default" && names.add(n);
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/gm)) {
    for (const part of m[1].split(",")) add(part.trim().split(/\s+as\s+/).pop()?.trim());
  }
  return [...names];
}

/** Every identifier any file imports, from anywhere — including the tests,
 * which are legitimate consumers. */
function importedNames(files) {
  const used = new Set();
  for (const rel of files) {
    let src;
    try {
      src = readFileSync(join(root, rel), "utf8");
    } catch {
      continue; // B-41: vanished since the walk — skipped, not fatal
    }
    // `import * as ns from "…"` then `ns.thing` — the first version of this
    // scan missed the whole class and reported every export of
    // `data/mock/db.ts` as dead while `lib/testHook.ts` was calling them
    for (const m of src.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/g)) {
      const ns = m[1];
      for (const u of src.matchAll(new RegExp("\\b" + ns + "\\.([A-Za-z_$][\\w$]*)", "g"))) used.add(u[1]);
    }
    for (const m of src.matchAll(/import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s*from/g)) {
      if (m[1]) used.add(m[1]);
      for (const part of m[2].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
        if (name) used.add(name);
      }
    }
    // `export { X } from "./y"` re-exports count as a use of X
    for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}\s*from/gm)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
        if (name) used.add(name);
      }
    }
  }
  return used;
}

/** Every file whose imports count as a use. Readers include the tests — a
 * symbol a test exercises is not dead. The `includeTests` flag matters:
 * `walk()` filters spec/test files out by default because they are never
 * SUBJECTS, and the first version of this reused that walk for readers too,
 * so every export used only by a test was reported dead — the whole of
 * `lib/time.ts` among them. `--readers` prints this list, which is how
 * `tests/unit/unused-exports.test.ts` proves what the walker will and will
 * not open (B-41). */
function readerFiles(all = DIRS.flatMap((d) => walk(d))) {
  return [...all, ...walk("tests", [], true), ...walk("e2e", [], true)];
}

function unusedExports() {
  const all = DIRS.flatMap((d) => walk(d));
  const used = importedNames(readerFiles(all));

  const out = [];
  for (const rel of all) {
    const norm = relative(".", rel).split("\\").join("/");
    if (EXCLUDE_SUBJECT.some((re) => re.test(norm))) continue;
    if ([...ALLOWED.keys()].some((k) => !k.includes(" → ") && norm.startsWith(k))) continue;
    for (const name of exportsOf(readFileSync(join(root, rel), "utf8"))) {
      if (used.has(name)) continue;
      if (ALLOWED.has(`${norm} → ${name}`)) continue;
      out.push(`${norm} → ${name}`);
    }
  }
  return out.sort();
}

if (process.argv[1] && process.argv[1].endsWith("unused-exports.mjs") && process.argv.includes("--readers")) {
  for (const rel of readerFiles()) console.log(rel);
} else if (process.argv[1] && process.argv[1].endsWith("unused-exports.mjs")) {
  const unused = unusedExports();
  if (unused.length === 0) {
    console.log("unused-exports: none");
  } else {
    console.log(`unused-exports: ${unused.length} export(s) nothing imports`);
    for (const line of unused) console.log("  " + line);
    process.exit(1);
  }
}
