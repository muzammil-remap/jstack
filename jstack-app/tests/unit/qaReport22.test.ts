/**
 * QA-02 (V2.2 half) — `QA_REPORT_v22.md` §1 must equal the tree it describes.
 *
 * The V2.1 equivalent lives in `handover.test.ts` and is written against that
 * report's four statuses. This is the same guard for V2.2, and it exists because
 * §1's rows are GENERATED (`tools/qa-rows.mjs`) and a generated table with no
 * check is a table that stops matching its generator the first time somebody
 * edits a row by hand.
 *
 * The status vocabulary CHANGED for V2.2 and that is deliberate: V2.1 used
 * "STAGE 4" for work deferred to its audit stage; V2.2's audit is Stage 6, so
 * the literal is "STAGE 6". Writing the guard against the v21 list would have
 * failed every deferred row in this file.
 *
 * Seen to fail: changing LL-01's status to PASS prints
 *   ["LL-01: PASS but no file cited"]
 * and pointing UP-01 at a file that does not quote it prints
 *   ["UP-01: none of e2e/core/lock.spec.ts exists and quotes it"].
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..");

const STATUSES = ["PASS", "PARTIAL", "DEVIATION", "STAGE 6"];

const report = () => readFileSync(join(REPO, "QA_REPORT_v22.md"), "utf8");

/**
 * §1 ONLY. §2's LV table has the same row shape, and reading both gave 200 rows
 * for 190 IDs — and reported §2's PARTIALs (which mean "a guard with a stated
 * remainder") against §1's rule for PARTIAL ("no test names this ID"). Two
 * sections, two vocabularies; a parser that cannot tell them apart judges one by
 * the other's rules.
 */
const section1 = () => {
  const t = report();
  return t.slice(t.indexOf("## §1."), t.indexOf("## §2."));
};

type Row = { id: string; status: string; check: string; evidence: string };

const rows = (): Row[] =>
  section1()
    .split("\n")
    .map((l) => /^\| ([A-Z][A-Z0-9]{1,3}-\d{2}) \| ([A-Z 6]+) \| (.*?) \| (.*) \|$/.exec(l))
    .filter((m): m is RegExpExecArray => m != null)
    .map((m) => ({ id: m[1], status: m[2].trim(), check: m[3], evidence: m[4] }));

/** the §1 ID list, from the acceptance document's own group tables */
function declaredIds(): string[] {
  // A4R2-08: §3's JQ and CD ids are acceptance ids with checks, and slicing
  // at §2 left twenty-one of them with no status anywhere in this report.
  const acc = readFileSync(join(REPO, "02_ACCEPTANCE_TESTS_v22.md"), "utf8");
  const part1 = acc.slice(0, acc.indexOf("## §2."));
  const part3 = acc.slice(acc.indexOf("## §3."), acc.indexOf("## §4."));
  return [...new Set([...(part1 + "\n" + part3).matchAll(/^\| ([A-Z][A-Z0-9]{1,3}-\d{2}) \|/gm)].map((m) => m[1]))];
}

const PATH = /`([A-Za-z0-9_./@\-]+\.(?:ts|tsx|mjs|md|yml|json))`/g;
const resolve = (p: string) => [join(APP, p), join(REPO, p)].find((f) => existsSync(f));
// Both documents quote every ID by construction; neither is evidence of anything.
const NOT_EVIDENCE = /02_ACCEPTANCE_TESTS|QA_REPORT_v22/;

describe("QA-02 · QA_REPORT_v22.md §1 describes the tree it sits in", () => {
  it("every §1 acceptance ID has exactly one row, and every row is a §1 ID", () => {
    const declared = declaredIds();
    const table = rows();
    expect(table.length).toBe(declared.length);
    expect(table.map((r) => r.id).sort()).toEqual(declared.slice().sort());
  });

  it("every status is one of the four literals", () => {
    expect(rows().filter((r) => !STATUSES.includes(r.status)).map((r) => `${r.id}: ${r.status}`)).toEqual([]);
  });

  it("every PASS and DEVIATION row cites a file that exists and quotes the ID", () => {
    const bad: string[] = [];
    for (const r of rows()) {
      if (r.status === "STAGE 6" || r.status === "PARTIAL") continue;
      const paths = [...r.evidence.matchAll(PATH)].map((m) => m[1]).filter((p) => !NOT_EVIDENCE.test(p));
      if (paths.length === 0) {
        bad.push(`${r.id}: ${r.status} but no file cited`);
        continue;
      }
      const quoting = paths.filter((p) => {
        const f = resolve(p);
        return f != null && readFileSync(f, "utf8").includes(r.id);
      });
      // A row may cite a delegate's file ("via OP-07"), which quotes the DELEGATE.
      const via = /\(via ([A-Z][A-Z0-9]{1,3}-\d{2})\)/.exec(r.evidence)?.[1];
      const quotingVia =
        via != null &&
        paths.some((p) => {
          const f = resolve(p);
          return f != null && readFileSync(f, "utf8").includes(via);
        });
      if (quoting.length === 0 && !quotingVia) bad.push(`${r.id}: none of ${paths.join(", ")} exists and quotes it`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * A PARTIAL row here means one precise thing — no test names the ID — so it
   * must NOT cite a test file. A PARTIAL that cites one is either mislabelled or
   * the citation is wrong, and both are worth a red test.
   */
  it("a PARTIAL row cites no test file, because that is what PARTIAL means here", () => {
    const bad = rows()
      .filter((r) => r.status === "PARTIAL")
      .filter((r) => /`[A-Za-z0-9_./@\-]+\.(spec|test)\.tsx?`/.test(r.evidence))
      .map((r) => `${r.id} is PARTIAL but cites a test`);
    expect(bad).toEqual([]);
  });

  /**
   * The completion statement was Stage 6 A-4's to write and had to be absent
   * until then, so this case asserted it was NOT here. A-6 has now run and the
   * statement is written, which makes the old assertion a guard that would go
   * red on the release it was protecting — the A-6 re-audit found it pointed
   * the wrong way (E4) while `board.yml` and `release.yml` both run `pnpm
   * test`, so the tag would have been cut on a red board.
   *
   * Turned around rather than deleted, because the PROPERTY it exists for is
   * still worth holding and is stronger stated positively: the report carries
   * a completion statement, and it carries one only because the audit signed
   * off. The audit's LAST verdict is what counts — an earlier round's sign-off
   * sitting above a later round's defects is B-269 exactly, and the same
   * mistake in a test would be worth as little as it was in the hook.
   */
  it("the completion statement is written, and AUDIT_v22.md's LAST verdict is a sign-off", () => {
    expect(/^## Completion statement$/m.test(report())).toBe(true);
    const verdicts = readFileSync(join(REPO, "AUDIT_v22.md"), "utf8")
      .split("\n")
      .filter((l) => /^(\*\*)?(Verdict: )?(SIGNED OFF|DEFECTS FOUND)/.test(l));
    expect(verdicts.length).toBeGreaterThan(0);
    expect(verdicts[verdicts.length - 1]).toContain("SIGNED OFF");
  });

  it("the V2 and V2.1 reports still carry a row for every ID in their own tables", () => {
    for (const [rep, acc] of [
      ["history/v2/QA_REPORT_v2.md", "02_ACCEPTANCE_TESTS_v2.md"],
      ["history/v21/QA_REPORT_v21.md", "02_ACCEPTANCE_TESTS_v21.md"],
    ]) {
      const text = readFileSync(join(REPO, rep), "utf8");
      // §1 ONLY, for both documents. §2 of the V2 pack rules on the v1.2 IDs and
      // §4 records expectation changes; neither is an acceptance ID the report
      // owes a row for, and counting them reported twenty-one false gaps.
      const full = readFileSync(join(REPO, acc), "utf8");
      const part1 = full.slice(0, full.indexOf("## §2."));
      const ids = [...new Set([...part1.matchAll(/^\| ([A-Z][A-Z0-9]{1,2}-\d{2}) \|/gm)].map((m) => m[1]))];
      const missing = ids.filter((id) => !new RegExp(`^\\| ${id} \\|`, "m").test(text));
      expect({ rep, missing }).toEqual({ rep, missing: [] });
    }
  });
});

/**
 * A4-06 (the A-4 audit) — §1's own vocabulary defines PASS as "a test or spec
 * file quotes the ID, and the board in §3 is green. **The board is what proves
 * it passes**". There was no §3. A hundred and sixty-two PASS rows rested on a
 * section nobody had written, `HANDOVER_v22.md` §8 sent readers to it for the
 * Jest and e2e figures, and the guard for this file checked §1's rows, statuses
 * and citations without ever asking whether the thing they lean on exists.
 *
 * So: it exists, and it says what the evidence says.
 */
describe("QA-03 · §3 exists, and its board is the run's own numbers", () => {
  const section3 = () => {
    const text = report().replace(/\r\n/g, "\n");
    const start = text.indexOf("## §3. The board");
    expect(start).toBeGreaterThan(-1); // the section 162 PASS rows depend on
    return text.slice(start);
  };

  const jest = () => JSON.parse(readFileSync(join(APP, "evidence", "jest-summary.json"), "utf8")) as Record<string, number>;
  const e2e = () => JSON.parse(readFileSync(join(APP, "evidence", "e2e-summary.json"), "utf8")) as {
    main: Record<string, number>;
    projects: Record<string, Record<string, number>>;
  };

  it("§3 is there at all, and §1's definition of PASS still points at it", () => {
    expect(section3().length).toBeGreaterThan(500);
    expect(report()).toContain("the board in §3 is green");
  });

  /**
   * D-12b (QA) — `num()` below already fails hard on a missing match (`null
   * !== number`), so §3 was never exposed to `expectEveryMatch`'s "return
   * on zero matches" class of silent pass. Checked anyway, the same
   * defensive shape `handover.test.ts` now carries for HANDOVER_v2.md and
   * QA_REPORT_v2.md: neither pre-D-12 shape may sit in §3 alongside the
   * current line.
   */
  it("§3 carries no stale pre-D-12 count shape", () => {
    const text = section3();
    expect([...text.matchAll(/\b\d+ passed \/ \d+\b/g)].map((m) => m[0])).toEqual([]);
    expect([...text.matchAll(/\b\d+ Jest tests?\b/g)].map((m) => m[0])).toEqual([]);
  });

  it("the Jest and e2e figures equal evidence/*.json, every one of them", () => {
    const text = section3();
    const num = (pattern: RegExp): number | null => {
      const m = pattern.exec(text);
      return m == null ? null : Number(m[1]);
    };
    const j = jest();
    const { main, projects } = e2e();
    expect({
      // D-12: "X passed / Y" used to let X read equal to Y over a suite that
      // skips one BY DESIGN (serveMockRig, self-skipping outside `pnpm
      // serve:mock`) — true of the total, false of the word "passed". The
      // line now carries passed AND skipped as two different numbers:
      // "<passed> passed, <skipped> skipped by design / <total>, <suites>
      // suites".
      jestPassed: num(/pnpm test\s+(\d+) passed,/),
      jestSkipped: num(/pnpm test\s+\d+ passed, (\d+) skipped by design/),
      jestTotal: num(/pnpm test\s+\d+ passed, \d+ skipped by design \/ (\d+)/),
      jestSuites: num(/(\d+) suites \(unit \+ native\)/),
      e2ePassed: num(/pnpm test:e2e\s+(\d+) passed/),
      e2eFailed: num(/pnpm test:e2e\s+\d+ passed, (\d+) failed/),
      e2eSkipped: num(/pnpm test:e2e\s+\d+ passed, \d+ failed, \d+ flaky, (\d+) skipped/),
      e2eTotal: num(/skipped of (\d+),/),
      core: num(/\(core (\d+):/),
      matrix: num(/matrix (\d+) over 8 projects/),
    }).toEqual({
      // §3's Jest TOTAL and SKIPPED come from the summary directly — neither
      // depends on which test in THIS run passed or failed, so neither has
      // the lag problem below. PASSED is DERIVED from them (total minus
      // skipped) rather than read as `numPassedTests`, on purpose: this case
      // is itself one of the tests `numPassedTests` counts, and comparing it
      // to `numPassedTests` straight would ask the summary to already
      // reflect a run where this exact assertion passed — which requires it
      // to have passed already, which is the thing being checked. Deriving
      // from total/skipped instead asks the honest question ("does the doc
      // say total-minus-skipped?") without asking the file to predict its
      // own future.
      //
      // What proves the board has no OTHER failure is the run's own exit
      // code and the close-out chain (`pnpm test && … && git commit`,
      // B-98), which is where a red Jest stops a commit — not this
      // assertion. The e2e figures below have no such problem: they come
      // from a different run, so `failed: 0` is compared against the
      // record and means it.
      jestPassed: j.numTotalTests - j.numPendingTests,
      jestSkipped: j.numPendingTests,
      jestTotal: j.numTotalTests,
      jestSuites: j.numTotalTestSuites,
      e2ePassed: main.passed,
      e2eFailed: main.failed,
      e2eSkipped: main.skipped,
      e2eTotal: main.total,
      core: projects.core.total,
      matrix: projects.matrix.total,
    });
  });
});

/**
 * A4R2-05 — §1 and §2 are two tables about the same ten IDs, and they
 * disagreed on five: §1 said PASS where §2 said PARTIAL four times and
 * DEVIATION once. §1 is generated and §2 is hand-written, so §2 went stale as
 * guards landed under it — and `qaReport22.test.ts` sliced the file at
 * `## §2.`, which left §2 unguarded entirely.
 *
 * One fact, one declaration (rule 16): the STATUS is the generator's, and §2's
 * job is the reasoning beside it. Where the generator was the wrong one — a
 * recorded deviation flattened to PASS because a test happened to name the ID
 * — the fix was the generator's `DEVIATION_IDS` table, not a hand-edit of §1.
 */
describe("QA-03 · §1 and §2 do not disagree about an LV id", () => {
  const statuses = (from: string, to: string) => {
    const text = report().replace(/\r\n/g, "\n");
    const slice = text.slice(text.indexOf(from), to === "" ? undefined : text.indexOf(to));
    // `[A-Z 6]`, not `[A-Z ]`: "STAGE 6" carries a digit, and a class without
    // one silently drops LV-10 and reports nine rows for ten IDs
    return new Map([...slice.matchAll(/^\| (LV-\d{2}) \| ([A-Z][A-Z 6]+?) \|/gm)].map((m) => [m[1], m[2].trim()]));
  };

  it("every LV row in §2 either matches §1 or SAYS why it does not", () => {
    // A4R3-02: the first version of this case demanded §2 equal §1, and the
    // A4R2-05 fix satisfied it by editing four status literals and leaving the
    // reasoning underneath — two of which were still TRUE. So the guard made a
    // contradiction permanent: four rows read PASS with a bolded PARTIAL
    // verdict inside the same cell, and `HANDOVER_v22.md`'s known-gaps table
    // went on citing §2 for a gap §2 now denied.
    //
    // The two sections make DIFFERENT claims and must be allowed to differ.
    // §1's PASS is mechanical and generated: some file quotes this ID. §2 is
    // the ADR-65 liveness self-check, where the builder's judgement about ten
    // properties is recorded — LV-02's property is "…or every entry is named",
    // and the twenty uncalled routes are not yet named where the row says they
    // belong. What they may not do is differ SILENTLY.
    const one = statuses("## §1.", "## §2.");
    const two = statuses("## §2.", "## §3.");
    expect(one.size).toBe(10); // LV-01..LV-10; a slice that read nothing would pass silently
    expect(two.size).toBeGreaterThan(8);

    const body = report().replace(/\r\n/g, "\n");
    const section2 = body.slice(body.indexOf("## §2."), body.indexOf("## §3."));
    const unexplained: string[] = [];
    for (const [id, s2] of two) {
      if (one.get(id) === s2) continue;
      const row = section2.split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? "";
      // the difference has to be argued in the cell, naming both verdicts
      if (!/and §1 says/.test(row)) unexplained.push(`${id}: §2 ${s2}, §1 ${one.get(id)}, with no stated reason`);
    }
    expect(unexplained).toEqual([]);
  });

  it("A4R3-02: no §2 cell carries a verdict its own status contradicts", () => {
    // the other half: a cell may not say PARTIAL in bold while its status
    // column says PASS. That is what the A4R2-05 fix left behind.
    const body = report().replace(/\r\n/g, "\n");
    const section2 = body.slice(body.indexOf("## §2."), body.indexOf("## §3."));
    const contradictions = section2
      .split("\n")
      .filter((l) => /^\| LV-\d{2} \| PASS \|/.test(l) && /\*\*PARTIAL/.test(l))
      .map((l) => (/^\| (LV-\d{2})/.exec(l)?.[1] ?? l.slice(0, 12)) + " is PASS and says PARTIAL in the same cell");
    expect(contradictions).toEqual([]);
  });
});

/**
 * A4R4-06 — §2's SUMMARY is a claim like any other.
 *
 * A4R2-05 raised four status literals to match §1; A4R3-02 put the two that
 * were still true back and rewrote the reasoning; and the paragraph beneath the
 * table went on saying "six green … one real gap … two are Stage 6's" through
 * both, because both guards read table ROWS. Third residue of one edit, and the
 * reason this one reads the prose.
 */
describe("QA-03 · §2's summary counts its own table", () => {
  it("the green/deviation/gap/stage tallies equal the statuses above them", () => {
    const body = report().replace(/\r\n/g, "\n");
    const section2 = body.slice(body.indexOf("## §2."), body.indexOf("## §3."));
    const rows = [...section2.matchAll(/^\| (LV-\d{2}) \| ([A-Z][A-Z 6]+?) \|/gm)].map((m) => [m[1], m[2].trim()] as const);
    expect(rows.length).toBe(10);

    const tally = { PASS: 0, DEVIATION: 0, PARTIAL: 0, "STAGE 6": 0 } as Record<string, number>;
    for (const [, s] of rows) tally[s] = (tally[s] ?? 0) + 1;

    const stated = (pattern: RegExp): number | null => {
      // None and Zero are the words prose uses when a tally is 0, and at A-6 one
      // of these tallies IS 0 — the STAGE 6 status meant "a stage that has not
      // run" and every stage has now run (the audit's D-4). A parser that knows
      // every number but zero forces the document to phrase it as a digit.
      const words: Record<string, number> = { None: 0, Zero: 0, One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10 };
      const m = pattern.exec(section2);
      return m == null ? null : (words[m[1]] ?? Number(m[1]));
    };
    expect({
      green: stated(/\*\*(\w+) of the ten are green/),
      deviation: stated(/\*\*(\w+) (?:is|are) a deviation/),
      gaps: stated(/\*\*(\w+) (?:is|are) (?:a )?real gaps?\*\*/),
      stage: stated(/\*\*(\w+) (?:is|are) Stage 6's\*\*/),
    }).toEqual({
      green: tally.PASS,
      deviation: tally.DEVIATION,
      gaps: tally.PARTIAL,
      stage: tally["STAGE 6"],
    });
  });
});

describe("D11 · §1's own sentence about §1", () => {
  // The A-6 re-audit found §1's legend saying "Thirteen rows carry it, listed
  // below" over a table carrying twenty, and naming thirteen. A-169 did it:
  // emptying the STAGE 6 sets moved seven rows into PARTIAL and the sentence
  // that counts them did not move with them. Everything else in this file reads
  // §2's prose tallies or §3's numbers, so nothing was looking at §1's own
  // prose — and "named rather than buried" promises COMPLETENESS, which is a
  // worse thing to break than an ordinary stale number.
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
    "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five"];

  const partial = () => rows().filter((r) => r.status === "PARTIAL").map((r) => r.id);

  it("the legend and the heading both count the PARTIAL rows in the table under them", () => {
    const ids = partial();
    expect(ids.length).toBeGreaterThan(0);
    const word = WORDS[ids.length];
    const legend = /\*\*PARTIAL\*\* — \*\*no test file quotes this ID\.\*\* ([A-Za-z-]+) rows carry it/.exec(report());
    expect(legend).not.toBeNull();
    expect(legend![1].toLowerCase()).toBe(word);
    const heading = /### The ([a-z-]+) PARTIAL rows, named rather than buried/.exec(report());
    expect(heading).not.toBeNull();
    expect(heading![1]).toBe(word);
  });

  it("and names every one of them, in the table's own order", () => {
    const ids = partial();
    const after = report().slice(report().indexOf("PARTIAL rows, named rather than buried"));
    const line = after.split("\n").find((l) => l.trim().startsWith("`")) ?? "";
    const named = (line.match(/`([A-Z][A-Z0-9]{1,3}-\d{2})`/g) ?? []).map((x) => x.replace(/`/g, ""));
    expect(named).toEqual(ids);
  });
});
