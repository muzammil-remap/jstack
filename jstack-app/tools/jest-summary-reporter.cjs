/**
 * Writes the suite's own totals to evidence/jest-summary.json (AUDIT D-33):
 * QA_REPORT's board numbers are asserted against this file the same way
 * HANDOVER's counts are asserted against mutation-pass.json — the count lives
 * in an artifact the suite maintains, not in prose memory.
 *
 * The artifact is FULL-RUN ground truth, so a narrowed run must leave it
 * alone (AUDIT round 5 O-3, re-raised as V12-D15). Narrowing is not only
 * `npx jest <file>` / `-t`: `--selectProjects` produces a subset with BOTH
 * patterns empty (749/27 against the full 874/30 here), which is how the
 * artifact still got clobbered with the pattern-only check in place. Every
 * known narrowing switch is therefore checked, and the skip prints a line so
 * a run that leaves the file untouched is never mistaken for a silent
 * failure.
 */
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

/** the `-p`/`--testPathPattern(s)` value, across jest's two shapes, as a string */
function pathPatternOf(g) {
  if (g.testPathPattern) return String(g.testPathPattern); // jest 29: single joined string
  const p = g.testPathPatterns; // jest 30: string[] or {patterns: string[]}
  if (Array.isArray(p)) return p.join("|");
  if (p && Array.isArray(p.patterns)) return p.patterns.join("|");
  return "";
}

/** every reason this run covered less than the whole suite */
function narrowingReasons(globalConfig, contexts) {
  const g = globalConfig ?? {};
  const reasons = [];
  const paths = pathPatternOf(g);
  if (paths) reasons.push(`test path filter ${JSON.stringify(paths)}`);
  if (g.testNamePattern) reasons.push(`test name filter ${JSON.stringify(String(g.testNamePattern))}`);
  if (g.onlyChanged) reasons.push("--onlyChanged");
  if (g.changedSince) reasons.push(`--changedSince=${g.changedSince}`);
  if (g.onlyFailures) reasons.push("--onlyFailures");
  if (g.findRelatedTests) reasons.push("--findRelatedTests");
  if (g.shard) reasons.push(`--shard=${g.shard.shardIndex}/${g.shard.shardCount}`);

  // --selectProjects / --ignoreProjects: neither pattern is set, but only
  // some of the configured projects produced a test context.
  const configured = Array.isArray(g.projects) && typeof g.projects[0] === "object" ? g.projects : null;
  const ran = contexts ? Array.from(contexts) : [];
  if (configured && ran.length > 0 && ran.length < configured.length) {
    const nameOf = (c) => (c && c.displayName && (c.displayName.name ?? c.displayName)) || "(unnamed)";
    const ranNames = ran.map((c) => nameOf(c.config ?? c));
    reasons.push(`project subset — ran [${ranNames.join(", ")}] of ${configured.length} configured projects`);
  }
  return reasons;
}

class JestSummaryReporter {
  constructor(globalConfig) {
    this._globalConfig = globalConfig;
  }

  onRunComplete(contexts, results) {
    const reasons = narrowingReasons(this._globalConfig, contexts);
    if (reasons.length > 0) {
      // observable on purpose: an untouched artifact must read as a
      // deliberate skip, not as a reporter that silently died
      console.log(
        `\n[jest-summary] filtered run (${reasons.join("; ")}) — evidence/jest-summary.json NOT written ` +
          `(would have recorded ${results.numTotalTests} tests / ${results.numTotalTestSuites} suites). ` +
          `Run the full \`pnpm test\` to refresh it. (AUDIT O-3 / V12-D15)`,
      );
      return;
    }
    writeFileSync(
      join(__dirname, "..", "evidence", "jest-summary.json"),
      JSON.stringify(
        {
          numTotalTests: results.numTotalTests,
          numPassedTests: results.numPassedTests,
          // D-12: a doc that only ever quoted "X passed / Y" could print X
          // equal to Y over a suite that skips one BY DESIGN (serveMockRig,
          // self-skipping outside `pnpm serve:mock`) — true of the total,
          // false of the word "passed". Recorded so "passed" and "skipped"
          // are two different, checkable numbers rather than one borrowed
          // from the other.
          numPendingTests: results.numPendingTests,
          numTotalTestSuites: results.numTotalTestSuites,
        },
        null,
        1,
      ) + "\n",
    );
  }
}

module.exports = JestSummaryReporter;
