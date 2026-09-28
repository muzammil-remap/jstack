/**
 * `pnpm test:e2e` — the two-invocation Playwright board, with a machine-readable
 * record of what it proved (AUDIT round 5, Question 5).
 *
 * WHY A SCRIPT: the board has always been two invocations chained with `&&`
 * (BUGLOG A-19 / playwright.config.ts header) —
 *     playwright test --workers=4
 * — and each now also has to write a JSON report. Playwright takes that report's
 * path from the PLAYWRIGHT_JSON_OUTPUT_NAME environment variable, and `VAR=x cmd`
 * is not a thing on Windows (the build machine), so the env has to be set by the
 * process that spawns them. Hence this file rather than a longer npm script.
 *
 * `--reporter=dot,json` is passed on the CLI ON PURPOSE and `reporter` in
 * playwright.config.ts is left alone: targeted single-spec runs
 * (`pnpm test:e2e:targeted`) rely on the CLI override being the only thing that
 * changes reporters, and a config-level json reporter would make every ad-hoc
 * run scribble over the evidence file.
 *
 * OUTPUT — evidence/e2e-summary.json, the artifact QA_REPORT's board rows are
 * asserted against by tests/unit/handover.test.ts (same discipline as
 * evidence/jest-summary.json, AUDIT D-33). Shape and key names (row 5 of the
 * V2 build: `projects.core`/`projects.matrix` replace v1.2's `phone`/
 * `responsive` — there is no standalone "phone" project any more; `w393-
 * light` and `w1366-light` each run BOTH core and matrix specs, so the
 * core/matrix split is by spec FILE PATH (`e2e/core/` vs `e2e/matrix/`),
 * not by project):
 *
 *   {
 *     "main":     { total, passed, failed, flaky, skipped },  // the one invocation
 *     "combined": { total, passed, failed, flaky, skipped },  // what `pnpm test:e2e` proved
 *     "projects": {
 *       "core":   { total, passed, failed, flaky, skipped },              // e2e/core/**, summed over w393-light + w1366-light
 *       "matrix": { total, passed, failed, flaky, skipped, projectCount } // e2e/matrix/**, summed over all 8 w<width>-<scheme> projects
 *     },
 *     "generatedAt": "<ISO 8601>"
 *   }
 *
 * `passed`/`failed`/`flaky`/`skipped` are Playwright's expected / unexpected /
 * flaky / skipped test statuses; `total` is every test the invocation reported
 * (a test filtered out by --grep is not reported at all). `projects.matrix.
 * projectCount` is how many distinct matrix projects actually reported tests
 * (8 = 4 widths × light/dark).
 *
 * EXIT CODE: non-zero if either invocation fails — and if invocation 1 fails,
 * invocation 2 does not run (the `&&` semantics this replaced) and the exit code
 * is still non-zero. evidence/e2e-summary.json is only rewritten when BOTH
 * invocations ran to completion, so a half-finished board never overwrites the
 * committed record with a partial one.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const rawDir = join(appRoot, "evidence", ".e2e-raw"); // gitignored — see .gitignore
const summaryFile = join(appRoot, "evidence", "e2e-summary.json");
const playwrightCli = createRequire(join(appRoot, "package.json")).resolve("@playwright/test/cli");

/** anything after `pnpm test:e2e` is forwarded to BOTH invocations */
const passthrough = process.argv.slice(2);

/**
 * One invocation. CD-02: there were two, `main` (`--grep-invert @timing`) and
 * a serial `timing` lane — and in the whole V2 build not one test was ever
 * tagged `@timing`. So the second lane never ran, `anyTimingTestsExist()`
 * existed purely to stop `--grep @timing` failing the board over zero
 * matches, and every summary carried `"timing": {total: 0, …}` plus a
 * `combined` that only ever equalled `main`. Three moving parts and a
 * published field shape, all describing a lane with nothing in it.
 *
 * If a genuinely timing-sensitive test ever needs to run serially, add the
 * lane back with the test that needs it — at which point it will have a
 * reason, and the summary field will mean something.
 */
const INVOCATIONS = [{ key: "main", args: ["--workers=4"] }];

const emptyTally = () => ({ total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 });

function add(into, from) {
  for (const k of ["total", "passed", "failed", "flaky", "skipped"]) into[k] += from[k];
  return into;
}

/** Playwright's JSON report → { overall, byProject, byFamily } tallies.
 * `byFamily` keys on the spec file's directory (`core` | `matrix` | other)
 * rather than the project, since row-5's two core projects (w393-light,
 * w1366-light) run BOTH families side by side. */
function familyOf(specFile) {
  if (!specFile) return null;
  if (specFile.includes("/core/") || specFile.startsWith("core/")) return "core";
  if (specFile.includes("/matrix/") || specFile.startsWith("matrix/")) return "matrix";
  return null;
}

function tallyReport(file) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  const overall = emptyTally();
  const byProject = new Map();
  const byFamily = new Map();
  const visit = (suite) => {
    const family = familyOf(suite.file);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const project = test.projectName || "(default)";
        if (!byProject.has(project)) byProject.set(project, emptyTally());
        const buckets = [overall, byProject.get(project)];
        if (family) {
          if (!byFamily.has(family)) byFamily.set(family, emptyTally());
          buckets.push(byFamily.get(family));
        }
        for (const bucket of buckets) {
          bucket.total += 1;
          if (test.status === "expected") bucket.passed += 1;
          else if (test.status === "unexpected") bucket.failed += 1;
          else if (test.status === "flaky") bucket.flaky += 1;
          else bucket.skipped += 1;
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return { overall, byProject, byFamily };
}

// matrix project names are `${width}-${scheme}` — see WIDTHS in playwright.config.ts
const isMatrixProject = (name) => /^w\d+-(light|dark)$/.test(name);

rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

const tallies = {};
const projectTotals = new Map();
const familyTotals = new Map();
let failed = false;

for (const { key, args } of INVOCATIONS) {
  if (failed) {
    console.error(`test:e2e: skipping the '${key}' invocation — '${INVOCATIONS[0].key}' failed.`);
    break;
  }
  const jsonFile = join(rawDir, `${key}.json`);
  console.log(`\ntest:e2e [${key}]: playwright test ${[...args, ...passthrough].join(" ")}`);
  const run = spawnSync(process.execPath, [playwrightCli, "test", ...args, "--reporter=dot,json", ...passthrough], {
    cwd: appRoot,
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile },
  });
  if (run.error) {
    console.error(`test:e2e [${key}]: could not start playwright — ${run.error.message}`);
    failed = true;
    break;
  }
  if (run.status !== 0) failed = true;

  if (!existsSync(jsonFile)) {
    console.error(`test:e2e [${key}]: no JSON report at ${jsonFile} — cannot record this invocation.`);
    failed = true;
    break;
  }
  const { overall, byProject, byFamily } = tallyReport(jsonFile);
  tallies[key] = overall;
  for (const [project, tally] of byProject) {
    if (!projectTotals.has(project)) projectTotals.set(project, emptyTally());
    add(projectTotals.get(project), tally);
  }
  for (const [family, tally] of byFamily) {
    if (!familyTotals.has(family)) familyTotals.set(family, emptyTally());
    add(familyTotals.get(family), tally);
  }
}

if (tallies.main) {
  const matrix = { ...(familyTotals.get("matrix") ?? emptyTally()), projectCount: 0 };
  for (const [project] of projectTotals) {
    if (isMatrixProject(project)) matrix.projectCount += 1;
  }
  const core = familyTotals.get("core") ?? emptyTally();
  const summary = {
    main: tallies.main,
    // `combined` is kept as the published field every reader already uses
    // (tests/unit/handover.test.ts, the docs' counts). With one lane it
    // equals `main` — which is all it ever equalled (CD-02).
    combined: add(emptyTally(), tallies.main),
    projects: { core, matrix },
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(summaryFile, JSON.stringify(summary, null, 1) + "\n");
  console.log(
    `\ntest:e2e: ${summary.combined.passed} passed, ${summary.combined.failed} failed, ` +
      `${summary.combined.skipped} skipped ` +
      `(main ${summary.main.passed}p/${summary.main.skipped}s · ` +
      `core ${summary.projects.core.total} · matrix ${matrix.total} over ${matrix.projectCount} projects) ` +
      `→ evidence/e2e-summary.json`,
  );
} else {
  console.error("\ntest:e2e: board incomplete — evidence/e2e-summary.json left as it was.");
}

process.exit(failed ? 1 : 0);
