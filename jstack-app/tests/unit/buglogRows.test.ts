/**
 * LV-01 — every B-row names the guarding test that was red before the fix.
 *
 * Rule 14's first sentence is "seen to fail, or it is not a guard", and the
 * buglog is where that is recorded. A row saying "fixed" without naming what
 * was red is a claim with no gate (rule 15), and it is unfalsifiable later:
 * nobody can re-derive which test caught a bug from a diff.
 *
 * WHY THE FLOOR IS B-49, and this is a deviation stated rather than hidden.
 * The `*Red first:*` convention starts at B-49. Rows B-01..B-48 record what was
 * red in their prose but not on a parseable line. They cannot be retrofitted
 * honestly: rule 14 wants what the run PRINTED, and no one can print a run from
 * three days ago — a backfilled line would be a reconstruction wearing the
 * costume of evidence, which is worse than the gap it fills. So the guard holds
 * from B-49 forward, and the ~50 rows T2-2 adds are all above it.
 *
 * The half that DOES apply to every row: a named test file must exist. A row
 * citing a spec that was later renamed points at nothing, and that is the
 * failure qa-citations.test.ts was written for after thirty-nine of a hundred
 * and thirteen pointers in QA_REPORT_v2.md turned out to name the wrong test.
 *
 * Seen to fail: dropping the `*Red first:*` line from B-53 prints
 *   ["B-53 has no *Red first:* line"]
 * and pointing B-50 at `filez.spec.ts` prints
 *   ["B-50 names filez.spec.ts, which does not exist"].
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..");

/** The row at which `*Red first:*` became the convention. */
const CONVENTION_FROM = 49;

const buglog = readFileSync(join(REPO, "history", "v22", "BUGLOG_v22.md"), "utf8");

/** every spec/test file by basename — a citation names a basename, never a path */
function indexTests(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(spec|test)\.tsx?$/.test(name)) found.set(name, (found.get(name) ?? []).concat(full));
    }
  };
  walk(join(APP, "e2e"));
  walk(join(APP, "tests"));
  return found;
}

type Row = { id: string; n: number; body: string };

function rows(): Row[] {
  return buglog
    .split(/(?=^\*\*B-\d+ )/m)
    .filter((p) => /^\*\*B-\d+ /.test(p))
    .map((body) => {
      const n = Number(/^\*\*B-(\d+)/.exec(body)![1]);
      return { id: `B-${String(n).padStart(2, "0")}`, n, body };
    });
}

/**
 * A `*Red first:*` note is ONE PARAGRAPH, so the capture stops at a blank line.
 * It used to run to the next `**B-` header, which meant the last row in the file
 * swallowed everything after it to EOF — including a later section that quoted a
 * deliberately-fake spec name, which was then reported against the wrong row.
 * A guard that attributes evidence to a row that did not write it is worse than
 * no guard: it sends the reader to the wrong place.
 */
const redFirstOf = (body: string) => /\*Red first:\*([^\n]*(?:\n[^\n\s][^\n]*)*)/.exec(body)?.[1] ?? null;
const filesIn = (line: string) => [...line.matchAll(/([A-Za-z0-9_.\-]+\.(?:spec|test)\.tsx?)/g)].map((m) => m[1]);

describe("LV-01 · every B-row names the test that was red before the fix", () => {
  const paths = indexTests();
  const known = new Set(paths.keys());

  it("there are B-rows to check at all", () => {
    // R-01: pin the shape, never "non-empty" — a parser that silently matched
    // nothing would make every assertion below vacuously green.
    expect(rows().length).toBeGreaterThanOrEqual(42);
  });

  it(`every row from B-${CONVENTION_FROM} on carries a *Red first:* line`, () => {
    const missing = rows()
      .filter((r) => r.n >= CONVENTION_FROM && redFirstOf(r.body) == null)
      .map((r) => `${r.id} has no *Red first:* line`);
    expect(missing).toEqual([]);
  });

  it("every *Red first:* line names at least one test file", () => {
    const bad = rows()
      .filter((r) => redFirstOf(r.body) != null)
      .filter((r) => filesIn(redFirstOf(r.body)!).length === 0)
      .map((r) => `${r.id} names no test file`);
    expect(bad).toEqual([]);
  });

  it("every test file a row names exists on the tree", () => {
    const bad: string[] = [];
    for (const r of rows()) {
      const line = redFirstOf(r.body);
      if (line == null) continue;
      for (const f of filesIn(line)) if (!known.has(f)) bad.push(`${r.id} names ${f}, which does not exist`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * The half that catches a citation nobody could have checked by eye. Naming a
   * file that exists is not the same as naming a test that exists: while writing
   * T2-2's rows I cited "hold → complete → release → cancel → resting hint",
   * which is how `BUILD_PLAN_v22.md` DESCRIBES the test, not what the test is
   * called — and `holdToLock.test.ts` exists, so the filename check passed it.
   * That is precisely the defect qa-citations.test.ts was written for after
   * thirty-nine of a hundred and thirteen pointers in QA_REPORT_v2.md named a
   * different test than their row claimed.
   *
   * Quoted strings that are NOT titles are common and legitimate — a row often
   * quotes what the run printed. So the rule is: at least one quoted string on
   * the line must appear in one of the files it names.
   */
  it("every row's *Red first:* line quotes something that appears in a file it names", () => {
    const bad: string[] = [];
    for (const r of rows()) {
      const line = redFirstOf(r.body);
      if (line == null) continue;
      const quoted = [...line.matchAll(/[“"]([^”"\n]{6,})[”"]/g)].map((m) => m[1]);
      if (quoted.length === 0) continue; // a row may describe rather than quote
      const bodies = filesIn(line)
        .flatMap((f) => paths.get(f) ?? [])
        .map((p) => readFileSync(p, "utf8"));
      if (bodies.length === 0) continue; // the file check above already reported it
      if (!quoted.some((q) => bodies.some((b) => b.includes(q)))) {
        bad.push(`${r.id}: none of ${quoted.map((q) => JSON.stringify(q)).join(", ")} appears in ${filesIn(line).join(", ")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no row number is used twice", () => {
    const seen = new Map<number, number>();
    for (const r of rows()) seen.set(r.n, (seen.get(r.n) ?? 0) + 1);
    // B-03 has a documented "follow-up" row that reuses its number on purpose.
    const dupes = [...seen.entries()].filter(([n, c]) => c > 1 && n !== 3).map(([n]) => `B-${n}`);
    expect(dupes).toEqual([]);
  });
});
