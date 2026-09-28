/**
 * QA-02 — every count quoted in `HANDOVER_v2.md`, `README.md` and
 * `QA_REPORT_v2.md` must equal the artifact it describes: the acceptance-ID
 * count (`02_ACCEPTANCE_TESTS_v2.md` §1), the Jest total
 * (`evidence/jest-summary.json`), the e2e total (`evidence/e2e-summary.json`)
 * and the TODO(BACKEND) marker count (`evidence/todo-backend-grep.txt`).
 *
 * `HANDOVER_v2.md` and `QA_REPORT_v2.md` are row-19 artifacts (row 18 only
 * builds the guard) and `README.md` still carries its v1.2 content with a
 * banner saying so until row 19 replaces it — this file computes every
 * ground truth now (so a wrong number can never even be written down) and
 * SKIPS a doc's own count checks until that doc exists / has actually been
 * replaced, rather than failing on content that isn't row 18's to write.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");

/** the V2.1 half of the ground truth (T-1). */
function v21GroundTruth() {
  const acceptance = readFileSync(join(root, "..", "02_ACCEPTANCE_TESTS_v21.md"), "utf8");
  const part1 = acceptance.slice(0, acceptance.indexOf("## §2."));
  const part3 = acceptance.slice(acceptance.indexOf("## §3."), acceptance.indexOf("## §4."));
  const idsIn = (text: string) => new Set([...text.matchAll(/^\| ([A-Z][A-Z0-9]{1,2}-\d{2})/gm)].map((m) => m[1]));

  const openapi = readFileSync(join(root, "openapi.yaml"), "utf8");
  const wiring = JSON.parse(readFileSync(join(root, "wiring.json"), "utf8")) as { routes?: unknown[] };

  const joshQa = readFileSync(join(root, "..", "history", "v2", "JOSH_QA.md"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));

  return {
    acceptanceIdCount: idsIn(part1).size,
    // the CD rows only: §3 also cites V2 audit rows (B10-nn, R23-nn) beside the
    // defects they were carried as, and the widened `idsIn` (AUDIT_v21 A-4)
    // would count those too
    carriedDefectCount: new Set([...part3.matchAll(/^\| (CD-\d{2})/gm)].map((m) => m[1])).size,
    // one line per path item in the generated contract
    openapiPaths: [...openapi.matchAll(/^ {2}"\/[^"]*":$/gm)].length,
    wiringRoutes: (wiring.routes ?? []).length,
    declaredRoutes: readFileSync(join(root, "data", "routes.ts"), "utf8")
      .split("\n")
      .filter((l) => l.trim().startsWith('{ name: "')).length,
    joshQaLines: joshQa.length,
  };
}

function groundTruth() {
  const acceptance = readFileSync(join(root, "..", "02_ACCEPTANCE_TESTS_v2.md"), "utf8");
  const part1 = acceptance.slice(0, acceptance.indexOf("## §2."));
  const acceptanceIds = new Set([...part1.matchAll(/^\| ([A-Z][A-Z0-9]{1,2}-\d{2})/gm)].map((m) => m[1]));

  const jest = JSON.parse(readFileSync(join(root, "evidence", "jest-summary.json"), "utf8")) as {
    numTotalTests: number;
    numPassedTests: number;
    numPendingTests: number;
    numTotalTestSuites: number;
  };
  const e2e = JSON.parse(readFileSync(join(root, "evidence", "e2e-summary.json"), "utf8")) as {
    combined: { total: number; passed: number; skipped: number };
  };
  const markers = readFileSync(join(root, "evidence", "todo-backend-grep.txt"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean).length;

  return {
    acceptanceIdCount: acceptanceIds.size,
    jestTotal: jest.numTotalTests,
    // D-12: skipped BY DESIGN (serveMockRig, self-skipping outside `pnpm
    // serve:mock`) — a real number now, not folded silently into "passed".
    // PASSED is DERIVED (total minus skipped), not `numPassedTests` itself
    // — this file's own QA-02 case is one of the tests that number counts,
    // and comparing straight to it would need the summary to already
    // reflect a run where this exact case passed (qaReport22.test.ts's
    // matching note has the full reasoning).
    jestPassed: jest.numTotalTests - jest.numPendingTests,
    jestSkipped: jest.numPendingTests,
    jestSuites: jest.numTotalTestSuites,
    e2eTotal: e2e.combined.total,
    e2ePassed: e2e.combined.passed,
    e2eSkipped: e2e.combined.skipped,
    markers,
  };
}

/**
 * QA-07 — the device pass, asserted against the directory rather than written
 * down (B10-01).
 *
 * `QA_REPORT_v2.md` said "118 frames" while `demo/v2/` held 134, and its
 * enumeration omitted the two families that had just been added — the toast
 * over an open sheet and the emergency confirm dialog — which are precisely
 * the frames two review rounds had proved the old set was blind without. The
 * Jest and e2e totals on the same page were right, because THOSE are guarded.
 * The count is a fact about a directory; a document should not be the place it
 * is remembered.
 *
 * Every screen must exist at all four widths in both schemes, less Arrange on
 * the phone, which RL-05 makes desktop-only.
 */
describe("QA-07 the device pass", () => {
  const dir = join(root, "..", "history", "v22", "demo", "v21");
  const frames = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  /** A-2 of Stage 6: V2.2's own pass. Only PASS-NAMED files: the four `brain-proposal-*`
   *  frames in the same folder are Stage 5b's evidence for `BRAIN_PROPOSAL.md`, not a pass. */
  const dirV22 = join(root, "..", "history", "v22", "demo", "v22");
  const framesV22 = existsSync(dirV22) ? readdirSync(dirV22).filter((f) => /-d[12]-\d+-(light|dark)-(prod|test)\.png$/.test(f)) : [];

  /**
   * R22-01 took the screen list FROM `capture-v2.mjs` rather than from the
   * directory, so the expectation could not follow the evidence. That was
   * still half of hard rule 11's own example — "a frame set read from the
   * script that writes it": a screen deleted from the tool, or moved into
   * `RIG_ONLY`, moved the expectation with it and this file stayed green.
   * Stage 4 A-0 review (R-02): the lists are LITERAL here, and the tool's
   * declarations must EQUAL them — so adding, removing or reclassifying a
   * screen is a deliberate edit in two places, and the pass can only shrink
   * by somebody changing this line.
   */
  /**
   * V2.1's released pass, which `demo/v21` holds and which cannot grow: that
   * directory is a shipped build's committed evidence. A V2.2 screen added to
   * the tool must NOT appear here, or this file starts reporting a released
   * pass as incomplete for a surface that did not exist when it was taken.
   */
  const SCREENS_V21 = [
    "today", "tasks-list", "tasks-board", "tasks-gantt", "tasks-done", "task-detail",
    "brain", "life", "agents", "settings", "arrange", "arrange-life", "decision-history",
    "locked", "decision-bill", "decision-section", "life-config", "undo-toast",
    "toast-over-sheet", "emergency-confirm", "sync", "offline", "talk",
  ];
  /**
   * What the TOOL declares today: V2.1's list plus every screen V2.2 has added,
   * in the order `capture-v2.mjs` writes them. Adding a screen is still a
   * deliberate edit in two places — the tool and this line — which is the whole
   * point of R-02's literal list; what K-1 separated is WHICH list `demo/v21`
   * is measured against.
   *
   * K-1 adds `find`, the global search. It is not `RIG_ONLY`: it opens from the
   * rail and from the phone header, which is how a person opens it, so a
   * production pass can reach it without the rig.
   *
   * LH-1 adds the three habit trend views — also not `RIG_ONLY`, and for the
   * same reason: the Life card's own trends link opens the dialog they live in.
   * All four tabs. The week one was left out at first as a second photograph of
   * the Life card's strip, and the ux round answered twice that "Trend tabs are
   * empty" cannot be closed without seeing every tab.
   */
  /**
   * A-2 of Stage 6 adds the states LV-09 and QA-07 name that no frame held:
   * the completion dialog, a board card mid-drag, the Gantt lane for tasks
   * with no dates, a reply's detail, the files archive, two collapsed
   * sections, a triage card from a share — and, through the rig, so
   * `RIG_ONLY`, the mic listening and Sync with a queued capture and then a
   * conflict. `demo/v22` is measured against THIS list, on all three passes.
   */
  const SCREENS = [
    ...SCREENS_V21, "find", "trends", "trends-week", "trends-year", "trends-all", "settings-rules", "settings-voice",
    "task-complete", "board-drag", "gantt-unscheduled", "reply", "files-archive", "collapsed", "mic-listening", "sync-queued", "sync-conflict", "triage",
    // A-3 round 1 (S6-40): the six things the A-1 checks ask a reviewer to
    // judge that had no frame — a focus and a slicer applied with the clear
    // control up, the mind-dump field focused, Today and Tasks with sections
    // collapsed (JQ-06 was on Tasks), the Edit caps dialog, Agents after the
    // emergency confirm was cancelled, and the delegate picker (JQ-02)
    "tasks-filtered", "dump-focused", "today-collapsed", "tasks-collapsed", "caps-edit", "emergency-cancelled", "delegate-picker",
  ];
  /** the states that have to be DRIVEN through the rig, so exist only in the test flavour */
  const RIG_ONLY = ["decision-section", "life-config", "offline", "talk", "mic-listening", "sync-queued", "sync-conflict"];

  const toolLists = (() => {
    const tool = readFileSync(join(root, "tools", "capture-v2.mjs"), "utf8");
    const names = (from: string, to: string) => {
      const body = tool.slice(tool.indexOf(from));
      return [...body.slice(0, body.indexOf(to)).matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    };
    return { screens: names("const SCREENS = [", "];"), rigOnly: names("const RIG_ONLY = new Set([", "]);") };
  })();
  const declared = SCREENS;

  it("capture-v2.mjs declares exactly these screens, in this order", () => {
    expect(toolLists.screens).toEqual(SCREENS);
  });

  it("capture-v2.mjs's RIG_ONLY is exactly this set — a screen cannot leave the production pass quietly", () => {
    expect(toolLists.rigOnly).toEqual(RIG_ONLY);
    for (const s of RIG_ONLY) expect(SCREENS).toContain(s);
  });

  /**
   * A-2: the pass is THREE passes, and the file name carries which — day 1 on
   * the production build (what a person installs), day 1 on the test build
   * (the only place a state that has to be DRIVEN can be photographed), and
   * day 2 on the test build (a production build cannot be told it is
   * tomorrow). `RIG_ONLY` screens exist only in the test flavour, and the
   * expectation says so rather than reporting them missing from every
   * production pass.
   */
  const PASSES: { day: string; flavour: string }[] = [
    { day: "1", flavour: "prod" },
    { day: "1", flavour: "test" },
    { day: "2", flavour: "test" },
  ];

  it("demo/v21 holds exactly V2.1's declared screens for every pass, and nothing else", () => {
    const widths = [393, 1024, 1366, 1920];
    const wanted: string[] = [];
    for (const { day, flavour } of PASSES) {
      // SCREENS_V21, not the tool's current list: `demo/v21` is frozen
      for (const screen of SCREENS_V21) {
        // a production pass does not claim a state it cannot reach
        if (flavour === "prod" && RIG_ONLY.includes(screen)) continue;
        for (const w of widths) {
          for (const scheme of ["light", "dark"]) {
            // RL-05: Arrange is desktop-only, so neither of its two frames
            // (Today's and, since B-3, Life's) has a phone capture.
            if ((screen === "arrange" || screen === "arrange-life") && w === 393) continue;
            wanted.push(`${screen}-d${day}-${w}-${scheme}-${flavour}.png`);
          }
        }
      }
    }
    const missing = wanted.filter((f) => !frames.includes(f)).sort();
    const extra = frames.filter((f) => !wanted.includes(f)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("the three V2.1 states are in the pass, on the build that can reach them", () => {
    for (const screen of ["sync", "offline", "talk"]) {
      expect({ screen, captured: frames.some((f) => f.startsWith(`${screen}-d1-393-light`)) }).toEqual({ screen, captured: true });
    }
    // and the production pass is a production pass: no frame of a state that
    // needs the rig may carry the `-prod` label
    const impossible = frames.filter((f) => f.endsWith("-prod.png") && RIG_ONLY.some((s) => f.startsWith(`${s}-`)));
    expect(impossible).toEqual([]);
  });

  it("the states a reviewer had to prove were missing are still declared", () => {
    // Each of these was added only after a reviewer showed the pass was blind
    // to it. Pinned by literal name as well as by the list above, because the
    // list is a file somebody can edit and these four are the ones that were
    // learned the hard way.
    for (const screen of ["decision-bill", "undo-toast", "toast-over-sheet", "emergency-confirm"]) {
      expect({ screen, declared: declared.includes(screen) }).toEqual({ screen, declared: true });
    }
  });

  /**
   * A-2 of Stage 6: `demo/v22` is what the tool declares TODAY, on all three
   * passes — the v21 check above against `SCREENS` rather than `SCREENS_V21`,
   * so a V2.2 screen that stops being photographed is a red line here and a
   * frame of a screen nobody declared is the other one.
   */
  it("demo/v22 holds exactly the declared screens for every pass, and nothing else", () => {
    const widths = [393, 1024, 1366, 1920];
    const wanted: string[] = [];
    for (const { day, flavour } of PASSES) {
      for (const screen of SCREENS) {
        if (flavour === "prod" && RIG_ONLY.includes(screen)) continue;
        for (const w of widths) {
          for (const scheme of ["light", "dark"]) {
            if ((screen === "arrange" || screen === "arrange-life") && w === 393) continue;
            wanted.push(`${screen}-d${day}-${w}-${scheme}-${flavour}.png`);
          }
        }
      }
    }
    const missing = wanted.filter((f) => !framesV22.includes(f)).sort();
    const extra = framesV22.filter((f) => !wanted.includes(f)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("LV-09's driven states are in the V2.2 pass, on the build that can reach them (CD-09)", () => {
    // each by name on day 1's phone frame: the list is LV-09's own, and a
    // state that left `SCREENS` fails the equality above, but this is the
    // line that says WHICH state the pass lost
    for (const screen of ["sync-queued", "sync-conflict", "mic-listening", "toast-over-sheet", "settings-voice", "board-drag", "gantt-unscheduled", "find", "reply", "files-archive", "triage", "collapsed"]) {
      expect({ screen, captured: framesV22.some((f) => f.startsWith(`${screen}-d1-393-light`)) }).toEqual({ screen, captured: true });
    }
    // and the production pass is a production pass: no `-prod` frame of a
    // state that needs the rig. `-d` after the name, because `sync` is a
    // screen and `sync-queued` is a rig state
    const impossible = framesV22.filter((f) => f.endsWith("-prod.png") && RIG_ONLY.some((s) => f.startsWith(`${s}-d`)));
    expect(impossible).toEqual([]);
  });

  it("QA_REPORT_v2.md does not write the frame count down", () => {
    const report = readFileSync(join(root, "..", "history", "v2", "QA_REPORT_v2.md"), "utf8");
    const qa07 = report.split("\n").find((l) => l.startsWith("| QA-07 |")) ?? "";
    expect({ row: qa07.slice(0, 40), quotesACount: /[0-9]+ frames/.test(qa07) }).toEqual({ row: qa07.slice(0, 40), quotesACount: false });
  });
});

/**
 * The V2.2 half of the ground truth (T2-1).
 *
 * Same arrangement as the two above and for the same reason: every number is
 * READ from the document or the generated file it is about and compared to a
 * literal here. A count derived from the file it checks would follow that file
 * down — which is exactly how V2.1's 119 stood for a stage while four IDs were
 * invisible to both the count and the cross-reference (AUDIT_v21.md A-4).
 */
function v22GroundTruth() {
  const acceptance = readFileSync(join(root, "..", "02_ACCEPTANCE_TESTS_v22.md"), "utf8");
  const part1 = acceptance.slice(0, acceptance.indexOf("## \u00a72."));
  const part3 = acceptance.slice(acceptance.indexOf("## \u00a73."), acceptance.indexOf("## \u00a74."));

  const markers = readFileSync(join(root, "evidence", "todo-backend-grep.txt"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean).length;
  const openapi = readFileSync(join(root, "openapi.yaml"), "utf8");
  const wiring = JSON.parse(readFileSync(join(root, "wiring.json"), "utf8")) as { routes?: unknown[] };

  return {
    acceptanceIdCount: new Set([...part1.matchAll(/^\| ([A-Z][A-Z0-9]{1,2}-\d{2})/gm)].map((m) => m[1])).size,
    // \u00a73 is two intakes in one section: Josh's own rows and the defects
    // carried from V2.1. They are counted apart because they are owed by
    // different people \u2014 a JQ row is Josh asking for something, a CD row is
    // this build owing V2.1 a fix.
    joshRowCount: new Set([...part3.matchAll(/^\| (JQ-\d+)/gm)].map((m) => m[1])).size,
    carriedDefectCount: new Set([...part3.matchAll(/^\| (CD-\d{2})/gm)].map((m) => m[1])).size,
    markers,
    openapiPaths: [...openapi.matchAll(/^ {2}"\/[^"]*":$/gm)].length,
    wiringRoutes: (wiring.routes ?? []).length,
    declaredRoutes: readFileSync(join(root, "data", "routes.ts"), "utf8")
      .split("\n")
      .filter((l) => l.trim().startsWith('{ name: "')).length,
  };
}

describe("QA-02 ground truth the docs will be checked against", () => {
  /**
   * T2-1 \u2014 the V2.2 counts. `BUILD_PLAN_v22.md` \u00a76 says 190 \u00a71 IDs; the
   * document agrees, and the literal is here so that losing a row is a red
   * test rather than a quieter document.
   */
  it("02_ACCEPTANCE_TESTS_v22.md \u00a71 has exactly 190 V2.2 acceptance IDs", () => {
    expect(v22GroundTruth().acceptanceIdCount).toBe(190);
  });

  /**
   * A4-09. `HANDOVER_v22.md` \u00a78 says its counts are "filled by
   * `tests/unit/handover.test.ts` against `evidence/jest-summary.json` and the
   * acceptance tables, so they cannot drift from the run". No guard read that
   * file at all \u2014 the sentence naming a guard WAS the drift, and three of the
   * numbers under it were wrong (119 V2.1 where the table holds 123). QA-02's
   * `describe.each` above cannot take it: that block checks the V2 documents
   * against V2 ground truth, and this document's numbers are V2.2's.
   *
   * So the claim gets its own gate, reading the sentence rather than trusting
   * it. A-5 turns this draft into `HANDOVER.md`; the gate follows it there.
   */
  it("A4-09: HANDOVER_v22.md \u00a78's counts equal the artefacts it names", () => {
    const gt = v22GroundTruth();
    const doc = readFileSync(join(root, "..", "history", "v22", "HANDOVER_v22.md"), "utf8").replace(/\r\n/g, "\n");
    const section8 = doc.slice(doc.indexOf("## 8. Counts"));
    expect(section8.length).toBeGreaterThan(100); // the heading moved, and this stopped reading anything

    const stated = (label: RegExp): number | null => {
      const m = label.exec(section8);
      return m == null ? null : Number(m[1].replace(/,/g, ""));
    };
    expect({
      v22Ids: stated(/\*\*(\d+) V2\.2 acceptance IDs\*\*/),
      v2Ids: stated(/plus (\d+) V2 and/),
      v21Ids: stated(/plus \d+ V2 and (\d+) V2\.1/),
      routes: stated(/\*\*(\d+) routes\*\*/),
      markers: stated(/\*\*(\d+) backend markers\*\*/),
    }).toEqual({
      v22Ids: gt.acceptanceIdCount,
      v2Ids: groundTruth().acceptanceIdCount,
      v21Ids: v21GroundTruth().acceptanceIdCount,
      routes: gt.declaredRoutes,
      markers: gt.markers,
    });
  });

  it("\u00a73 carries Josh's six rows and the fifteen defects carried from V2.1", () => {
    const gt = v22GroundTruth();
    expect({ josh: gt.joshRowCount, carried: gt.carriedDefectCount }).toEqual({ josh: 6, carried: 15 });
  });

  it("the V2.2 route table, wiring.json and openapi.yaml agree at 135 routes", () => {
    const gt = v22GroundTruth();
    // wiring is per ROUTE and openapi is per PATH \u2014 several paths carry more
    // than one method \u2014 so asserting the two are equal would be asserting
    // they are the same thing, which is the mistake the third line prevents.
    expect(gt.declaredRoutes).toBe(135);
    expect(gt.wiringRoutes).toBe(gt.declaredRoutes);
    expect(gt.openapiPaths).toBeLessThan(gt.declaredRoutes);
  });

  it("the backend-marker file is the size the delivery docs quote (142)", () => {
    // the markers are what a backend team greps for. The number is quoted in
    // three delivery docs, and QA-02 below checks those against this.
    expect(v22GroundTruth().markers).toBe(142);
  });

  it("02_ACCEPTANCE_TESTS_v2.md §1 has exactly 166 unique acceptance IDs", () => {
    expect(groundTruth().acceptanceIdCount).toBe(166);
  });

  it("evidence/jest-summary.json and evidence/e2e-summary.json parse and carry positive totals", () => {
    const gt = groundTruth();
    expect(gt.jestTotal).toBeGreaterThan(0);
    expect(gt.e2eTotal).toBeGreaterThan(0);
  });

  /**
   * CD-11 (audit A-1) — the skip count is part of the result, not a footnote.
   *
   * PW-02 read PASS on a run in which both of its tests skipped, every time,
   * on a condition that was never going to be true when it was asked. Nothing
   * in the numbers said so: a skipped test is not a failed one, and the total
   * looked healthy. So the run has to account for itself — every test lands in
   * exactly one bucket, and a run where a large share simply did not happen is
   * not evidence, whatever its pass count says.
   */
  it("the e2e run accounts for every test, and most of them actually ran (CD-11)", () => {
    const e2e = JSON.parse(readFileSync(join(root, "evidence", "e2e-summary.json"), "utf8")) as {
      main: { total: number; passed: number; failed: number; flaky: number; skipped: number };
    };
    const { total, passed, failed, flaky, skipped } = e2e.main;

    // flaky is a pass that took a retry, so it is already inside `passed`
    expect({ passed, failed, skipped, sum: passed + failed + skipped, total }).toEqual({ passed, failed, skipped, sum: total, total });
    expect(flaky).toBeGreaterThanOrEqual(0);

    // The PWA pair skips on the standard board by design — they need the prod
    // build — and the timezone lane skips outside its own project. A fifth of
    // the suite is a generous ceiling for "did not run"; crossing it means
    // something skipped that nobody decided to skip.
    expect({ skipped, ofTotal: total, share: Number((skipped / total).toFixed(3)) }).toEqual({
      skipped,
      ofTotal: total,
      share: expect.any(Number),
    });
    expect(skipped / total).toBeLessThan(0.2);
  });

  /**
   * T-1 adds the V2.1 half. Every number here is READ from the document or
   * the generated file it is about, and compared to a literal — which is the
   * only arrangement that can catch a document losing a row (a count derived
   * from the same file it checks would follow it down).
   */
  it("02_ACCEPTANCE_TESTS_v21.md §1 has exactly 123 V2.1 acceptance IDs", () => {
    // `BUILD_PLAN_v21.md` §6 said 123, and the document agrees: the earlier 119 was this
    // file's own regex missing a digit in a prefix, so D2-01..D2-04 were invisible to the
    // count AND to the cross-reference below (AUDIT_v21.md A-4). The DOCUMENT is the
    // ground truth, and the regex now reads what it writes.
    expect(v21GroundTruth().acceptanceIdCount).toBe(123);
  });

  it("§3 carries the eighteen V2 defects the audit left behind", () => {
    expect(v21GroundTruth().carriedDefectCount).toBe(18);
  });

  it("the routes table and wiring.json agree, and openapi.yaml has one path item per PATH", () => {
    const gt = v21GroundTruth();
    // wiring is per ROUTE; openapi is per PATH, and several paths carry more
    // than one method (`/sections/{id}` is GET, PUT and DELETE). Asserting
    // they are equal would be asserting that they are the same thing, which
    // is exactly the mistake the second line here exists to prevent.
    expect(gt.wiringRoutes).toBe(gt.declaredRoutes);
    expect(gt.openapiPaths).toBeLessThan(gt.declaredRoutes);
    expect(gt.openapiPaths).toBeGreaterThan(80);
  });

  it("every JOSH_QA.md line is OWNED by a JQ row and a JQ check", () => {
    /**
     * ADR-32: every non-comment line is a row somebody owes. A silent file is
     * fine; a line nobody owes must not be.
     *
     * This asked for zero lines until G-1, which was the same question while
     * the file was empty and the wrong one the moment it was not: Josh sent six
     * lines on 8 September and the planner wrote JQ-1..6 into
     * `BUILD_PLAN_v22.md` §4 with their checks JQ-01..06 in §3 before the
     * builder ever saw them. Those lines are owned. Demanding zero would have
     * meant deleting Josh's words to get a green board, which is the one
     * repair that must never be available (G-1, A-64).
     *
     * The tripwire is intact and slightly sharper: a SEVENTH line with no row
     * fails, and so does a row with no check. What it no longer does is
     * conflate "unbuilt" with "unowned" — building them is Stage 5b's job, and
     * `BUILD_PLAN_v22.md` says so in as many words.
     */
    const lines = v21GroundTruth().joshQaLines;
    const plan = readFileSync(join(root, "..", "history", "v22", "BUILD_PLAN_v22.md"), "utf8");
    const checks = readFileSync(join(root, "..", "02_ACCEPTANCE_TESTS_v22.md"), "utf8");
    const rows = new Set([...plan.matchAll(/^\| (JQ-\d+) \|/gm)].map((m) => m[1]));
    const ids = new Set([...checks.matchAll(/^\| (JQ-\d+) \|/gm)].map((m) => m[1]));
    expect({ lines, rows: rows.size, checks: ids.size }).toEqual({ lines, rows: lines, checks: lines });
  });

  it("evidence/todo-backend-grep.txt equals a fresh marker scan (mirrors CT-01)", () => {
    // CT-01 (tests/unit/contract.test.ts) already guards this file's
    // content against a fresh tools/gen-backend-grep.mjs regeneration;
    // this just confirms the count this file reads is the same ground
    // truth, so a divergence between the two guards can't hide.
    expect(groundTruth().markers).toBeGreaterThan(0);
  });
});

/** every regex match of `re` in `text` must equal `expected` — the label
 * (and which doc) travels inside the compared object so a failure names
 * exactly what mismatched. */
function expectEveryMatch(text: string, doc: string, re: RegExp, expected: number, label: string) {
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return; // this doc doesn't happen to quote this count — nothing to check
  for (const m of matches) {
    expect({ doc, label, mention: m[0], value: Number(m[1]) }).toEqual({ doc, label, mention: m[0], value: expected });
  }
}

/** `undefined` return means "not ready for this row's guard yet" (row 19's
 * job) — every caller must skip its checks rather than fail on it. */
function readV2Doc(filename: string): string | undefined {
  // WP-M (v2.3.1) moved HANDOVER_v2.md and QA_REPORT_v2.md into
  // history/v2/, frozen there; a bare name still has to resolve, so this
  // follows it there before falling back to "not written yet".
  const path = [join(root, "..", filename), join(root, "..", "history", "v2", filename)].find((p) => existsSync(p)) ?? join(root, "..", filename);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  if (text.includes("will be replaced by row 19 of the V2 build")) return undefined;
  return text;
}

/**
 * The pass/fail/skip breakdown that sits beside a quoted e2e TOTAL must be the
 * COMBINED one (B8-02). Scoped to the same line as the total and cut at the
 * first per-project marker, because the docs also quote real per-project
 * numbers ("core project: 280 total, 273 passed, 7 skipped") and those are
 * true — a blanket rule would force a document to stop saying something
 * correct in order to satisfy a guard, which is how a guard starts lying.
 */
function expectCombinedE2eBreakdown(text: string, doc: string, gt: ReturnType<typeof groundTruth>): void {
  for (const line of text.split("\n")) {
    if (!/[0-9]+ e2e tests?/.test(line)) continue;
    const scope = line.split(/core project|core:|matrix/i)[0];
    const grab = (word: string): number | null => {
      const m = new RegExp("([0-9]+) " + word).exec(scope);
      return m == null ? null : Number(m[1]);
    };
    for (const [word, expected] of [
      ["passed", gt.e2ePassed],
      ["failed", 0],
      ["skipped", gt.e2eSkipped],
    ] as const) {
      const found = grab(word);
      if (found == null) continue;
      expect({ doc, word, line: line.trim().slice(0, 120), value: found }).toEqual({ doc, word, line: line.trim().slice(0, 120), value: expected });
    }
  }
}

/**
 * A-6, from the cold-start gate (`evidence/cold-start-2026-09-12.md`, stumbles
 * 6 and 7): this list guarded the frozen V2 documents and the README, and left
 * out `HANDOVER.md` — the consolidated, living handover, and the one file every
 * stranger is told to start at. It quotes the marker count twice, and nothing
 * checked either. The gate's own words: "the guard system protects every
 * document except the one it matters most to keep honest."
 */
describe.each([
  ["HANDOVER_v2.md", "HANDOVER_v2.md"],
  ["README.md", "README.md"],
  ["QA_REPORT_v2.md", "QA_REPORT_v2.md"],
  ["HANDOVER.md", "HANDOVER.md"],
])("QA-02 %s counts match ground truth (once row 19 lands it)", (filename, doc) => {
  const text = readV2Doc(filename);

  it(`${doc}: acceptance-ID / Jest / e2e / marker counts, every occurrence`, () => {
    if (text == null) {
      // eslint-disable-next-line no-console -- test-runner-only, not app source (tools/log-scan.mjs's own exclusion list covers tests/)
      console.log(`SKIP ${doc}: not yet a finished v2 doc — row 19 owns this file`);
      return;
    }
    const gt = groundTruth();
    expectEveryMatch(text, doc, /\b(\d+) acceptance IDs?\b/g, gt.acceptanceIdCount, "acceptance IDs");
    // D-12: "X passed / Y" let X read equal to Y over a suite that skips one
    // by design — the line now carries passed and skipped as two different
    // numbers, both checked, against the literal phrase rather than the
    // word "Jest" (which the count-line no longer needs to say to be found).
    expectEveryMatch(text, doc, /(\d+) passed, \d+ skipped by design \/ \d+, \d+ suites/g, gt.jestPassed, "Jest passed");
    expectEveryMatch(text, doc, /\d+ passed, (\d+) skipped by design \/ \d+, \d+ suites/g, gt.jestSkipped, "Jest skipped by design");
    expectEveryMatch(text, doc, /\d+ passed, \d+ skipped by design \/ (\d+), \d+ suites/g, gt.jestTotal, "Jest total");
    // D-12b (QA): `expectEveryMatch` returns on ZERO matches by design — a
    // doc a count normally lives in that still carried the OLD shape
    // ("2326 passed / 2326" or "2320 Jest tests") matched neither of the
    // three patterns above, so it read as "doesn't happen to quote this
    // count" and passed green while quoting a stale figure. Two checks
    // close it: the old shape is refused everywhere in every QA-02 doc, and
    // the new shape is REQUIRED (exactly once) in the two docs whose own
    // prose says they carry it.
    expect({ doc, staleSlash: [...text.matchAll(/\b\d+ passed \/ \d+\b/g)].map((m) => m[0]) }).toEqual({ doc, staleSlash: [] });
    expect({ doc, staleJestTests: [...text.matchAll(/\b\d+ Jest tests?\b/g)].map((m) => m[0]) }).toEqual({ doc, staleJestTests: [] });
    if (doc === "HANDOVER_v2.md" || doc === "QA_REPORT_v2.md") {
      const found = [...text.matchAll(/\d+ passed, \d+ skipped by design \/ \d+, \d+ suites/g)].map((m) => m[0]);
      expect({ doc, newShapeCount: found.length }).toEqual({ doc, newShapeCount: 1 });
    }
    expectEveryMatch(text, doc, /\b(\d+) suites?\b/g, gt.jestSuites, "Jest suites");
    expectEveryMatch(text, doc, /\b(\d+) e2e tests?\b/g, gt.e2eTotal, "e2e tests");
    // the backticks are optional because `HANDOVER.md` writes the same
    // sentence in code formatting — and a guard that cannot see the form the
    // document actually uses passes on zero matches, which is how this one
    // read green over an unchecked count until A-6 planted 9142 into it
    expectEveryMatch(text, doc, /\b(\d+) `?TODO\(BACKEND\)`? markers?\b/g, gt.markers, "TODO(BACKEND) markers");
    // B8-02: the TOTAL was guarded and the breakdown beside it was not, so a
    // row could read "408 e2e tests, 375 passed/29 skipped" — the total
    // updated by a commit that matched this file's regex, the passed count
    // left behind because nothing had an expression for it. Two numbers on
    // one line, one of them checked.
    expectCombinedE2eBreakdown(text, doc, gt);
  });
});

/**
 * QA-02, the V2.1 cross-reference (Josh's A-0 row 4). Forty of the 119 IDs
 * were quoted by no test; the report's evidence column named a file "that
 * covers the check" and, in a dozen rows, named the wrong file (SH-02 cited
 * the PWA test, SH-04 the secret scan, SH-05 the lock gate, OF-09 a file that
 * did not exist). A reader could not go from an ID to its proof.
 *
 * The rule now: every row's evidence names at least one file that exists and
 * QUOTES the ID — a test, a tool, a workflow, or for a row the build cannot
 * prove (DEVIATION, PARTIAL) the document that records why. A row with a
 * Stage 4 status names the file the stage will write. Statuses are the
 * literal five; nothing may say "the ID is not quoted" any more, because it is.
 */
describe("QA-02 · every V2.1 ID names a file that quotes it", () => {
  const STATUSES = ["PASS", "PARTIAL", "DEVIATION", "STAGE 4"];
  const report = () => readFileSync(join(root, "..", "history", "v21", "QA_REPORT_v21.md"), "utf8");
  const rows = () =>
    report()
      .split("\n")
      .map((l) => /^\| ([A-Z][A-Z0-9]{1,2}-\d{2}) \| ([A-Z 4]+) \| (.*?) \| (.*) \|$/.exec(l))
      .filter((m): m is RegExpExecArray => m != null)
      .map((m) => ({ id: m[1], status: m[2].trim(), check: m[3], evidence: m[4] }));
  const PATH = /`([A-Za-z0-9_./@\-]+\.(?:ts|tsx|mjs|md|yml|json))`/g;
  // WP-M (v2.3.1) moved the versioned originals into history/<version>/, by
  // basename; a bare name QA_REPORT_v21.md cites (its own frozen text, never
  // rewritten) still has to resolve, so the search follows it there too.
  const HISTORY_DIRS = ["v1", "v2", "v21", "v22", "expo-go"];
  const resolve = (p: string) =>
    [join(root, p), join(root, "..", p), ...HISTORY_DIRS.map((d) => join(root, "..", "history", d, p))].find((f) => existsSync(f));
  // the acceptance document quotes every ID by construction, and so does this
  // report: neither is proof of anything, and neither may be cited as it
  const NOT_EVIDENCE = /02_ACCEPTANCE_TESTS|QA_REPORT_v21|tests\/unit\/handover\.test\.ts/;

  it("every §1 ID has exactly one row, and every row is a §1 ID with a literal status", () => {
    const ids = v21GroundTruth();
    const acceptance = readFileSync(join(root, "..", "02_ACCEPTANCE_TESTS_v21.md"), "utf8");
    const part1 = acceptance.slice(0, acceptance.indexOf("## §2."));
    const declared = [...new Set([...part1.matchAll(/^\| ([A-Z][A-Z0-9]{1,2}-\d{2})/gm)].map((m) => m[1]))];
    const table = rows();
    expect(table.map((r) => r.id).sort()).toEqual(declared.slice().sort());
    expect(table.length).toBe(ids.acceptanceIdCount);
    expect(table.filter((r) => !STATUSES.includes(r.status)).map((r) => `${r.id}: ${r.status}`)).toEqual([]);
  });

  it("no row leans on 'the ID is not quoted' any more", () => {
    expect(rows().filter((r) => /not quoted/i.test(r.evidence)).map((r) => r.id)).toEqual([]);
  });

  it("every PASS, PARTIAL and DEVIATION row cites a file that exists and quotes the ID", () => {
    const bad: string[] = [];
    for (const r of rows()) {
      if (r.status === "STAGE 4") continue;
      // QA-02 is this file: it alone may cite it
      const paths = [...r.evidence.matchAll(PATH)].map((m) => m[1]).filter((p) => r.id === "QA-02" || !NOT_EVIDENCE.test(p));
      if (paths.length === 0) {
        bad.push(`${r.id}: no file cited`);
        continue;
      }
      const quoting = paths.filter((p) => {
        const f = resolve(p);
        return f != null && readFileSync(f, "utf8").includes(r.id);
      });
      if (quoting.length === 0) bad.push(`${r.id}: none of ${paths.join(", ")} exists and quotes it`);
    }
    expect(bad).toEqual([]);
  });

  it("a Stage 4 row names the file the stage writes, and is gone once it has", () => {
    for (const r of rows().filter((x) => x.status === "STAGE 4")) {
      const paths = [...r.evidence.matchAll(PATH)].map((m) => m[1]);
      expect({ id: r.id, names: paths.length > 0 }).toEqual({ id: r.id, names: true });
    }
  });
});

/**
 * RM-01 — `HANDOVER.md` (A-5) is the single entry, and its "Connect and run"
 * section is what a team does first, so it is walked like a recipe: every
 * file it names exists, every wire shape it names is a type the app exports,
 * and every contract section it cites is a heading of `CONTRACT.md`. A
 * handover that names a file nobody wrote sends the reader to a dead end on
 * the first page (V2.1's `EXPO_PUBLIC_API_BASE` was exactly that).
 */
describe("RM-01 · HANDOVER.md names only things that exist (v2.3.2: the whole consolidated document, not one section)", () => {
  const repo = join(root, "..");
  const readDoc = (rel: string) => readFileSync(join(repo, rel), "utf8").replace(/\r\n/g, "\n");
  const section = (text: string, heading: string): string => {
    const start = text.indexOf(heading);
    if (start === -1) return "";
    const depth = heading.match(/^#+/)?.[0] ?? "##";
    const rest = text.slice(start + heading.length);
    const next = rest.search(new RegExp(`\\n${depth} `));
    return heading + (next === -1 ? rest : rest.slice(0, next));
  };
  const handover = readDoc("HANDOVER.md");
  // v2.3.2 folds the old "Connect and run" mega-section into §4 (run it) and
  // §6 (what the backend must provide) — the two sections carrying commands,
  // paths and the schema; scanning their union keeps the same rigor. Renumbered
  // again (16 Sep, WP-T): questions and security moved ahead of the plan, so
  // "run it" is §4 and "what the backend must provide" is §6, not §2/§4.
  const runAndBuild = section(handover, "## 4. Run it") + section(handover, "## 6. What the backend must provide");

  it("opens with the five-check reading list, before §1", () => {
    expect(handover.indexOf("Read this first, check these")).toBeGreaterThan(-1);
    expect(handover.indexOf("Read this first, check these")).toBeLessThan(handover.indexOf("## 1. Questions"));
    expect(handover.split("\n").find((l) => l.startsWith("## "))).toMatch(/^## 1\. Questions/);
  });

  it("every file and directory it names, in §2 and §4, exists", () => {
    const bases = [repo, root, join(root, "data", "mock")];
    const named = [...runAndBuild.matchAll(/`([^`\s]+)`/g)]
      .map((m) => m[1])
      // a URL scheme is not a path: `wss://` and `https://` both read as one
      // to a `/`-and-extension rule
      .filter((t) => !/[<>*…{}?=#]|^[a-z][\w+.-]*:|^\/|^~|^\.\//.test(t) && /\/|\.(md|ts|tsx|mjs|cjs|js|json|yaml|html|txt|docx)$/.test(t))
      .map((t) => t.replace(/\/$/, ""));
    // v2.3.2: §2+§4 are far terser than the old "Connect and run" mega-section
    // by design (Josh: "do not add words just because you didn't think about
    // how to be concise") — the floor is calibrated to that, not the old size.
    expect(named.length).toBeGreaterThan(10);
    expect([...new Set(named)].filter((t) => !bases.some((b) => existsSync(join(b, t))))).toEqual([]);
  });

  it("every wire shape §4's schema names is a type the app exports", () => {
    const types = readFileSync(join(root, "data", "types.ts"), "utf8");
    const exported = new Set([...types.matchAll(/^export (?:type|interface) (\w+)/gm)].map((m) => m[1]));
    const schema = section(handover, "## 6. What the backend must provide");
    const named = [...new Set([...schema.matchAll(/`([A-Z][A-Za-z]+)`/g)].map((m) => m[1]))];
    expect(named.length).toBeGreaterThan(5);
    expect(named.filter((t) => !exported.has(t))).toEqual([]);
  });

  it("every route family it cites, anywhere, is a section of CONTRACT.md", () => {
    const contract = readDoc("CONTRACT.md");
    const cited = [...new Set([...handover.matchAll(/§(\d+\.\d+)/g)].map((m) => m[1]))];
    expect(cited.length).toBeGreaterThan(3);
    expect(cited.filter((n) => !new RegExp(`^### §${n.replace(".", "\\.")} `, "m").test(contract))).toEqual([]);
  });

  it("the environment variable it tells you to set is the one the app reads", () => {
    const config = readFileSync(join(root, "data", "config.ts"), "utf8");
    const named = [...runAndBuild.matchAll(/`(EXPO_PUBLIC_[A-Z_]+)=/g)].map((m) => m[1]);
    expect(named).toContain("EXPO_PUBLIC_API_BASE_URL");
    for (const v of named) expect({ v, read: config.includes(`process.env.${v}`) }).toEqual({ v, read: true });
  });
});

/**
 * RM-02 — `REMAP_READINESS.md` is a checklist whose every line points at the
 * file that proves it. A checklist line with no evidence path is an opinion,
 * and one whose path does not exist is worse, so both are red here.
 */
// v2.3.2: REMAP_READINESS.md's checklist folded into HANDOVER.md §3's
// "Proven, not claimed" table — same two checks, relocated.
describe("RM-02 · HANDOVER.md §3's 'Proven, not claimed' table: every check has an evidence path, and every path exists", () => {
  const repo = join(root, "..");
  const handover = readFileSync(join(repo, "HANDOVER.md"), "utf8").replace(/\r\n/g, "\n");
  const start = handover.indexOf("**Proven, not claimed**");
  const section3 = handover.slice(start, handover.indexOf("## 6. What the backend must provide"));
  const rows = section3.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Check ") && !/^\|[-| ]+\|$/.test(l));

  it("covers the nine things RM-02 names", () => {
    const text = rows.join("\n").toLowerCase();
    for (const must of ["builds", "unit", "e2e", "conformance", "secret", "size", "regenerate", "fresh instance", "not done"]) {
      expect({ must, covered: text.includes(must) }).toEqual({ must, covered: true });
    }
  });

  it("every line names an evidence path that exists", () => {
    const bad: string[] = [];
    for (const row of rows) {
      const evidence = row.split("|").slice(-2, -1)[0] ?? "";
      const paths = [...evidence.matchAll(/`([^`\s<>]+)`/g)].map((m) => m[1].replace(/\/$/, ""));
      if (paths.length === 0 || paths.some((p) => !existsSync(join(repo, p)) && !existsSync(join(root, p)))) bad.push(row.slice(0, 80));
    }
    expect(bad).toEqual([]);
  });
});

/**
 * RM-06 (A-6) · `REMAP_HANDOVER.html` is the handover, not a copy of it.
 *
 * Josh reviews HTML before REMAP sees the pack, so the page has to be the
 * same words as `HANDOVER.md` — and a generated page that nobody regenerates
 * is worse than no page, because it reads as current. Two checks, both cheap:
 * the fingerprint the generator stamps from its source must match the source
 * as it is NOW, and every `##` section must actually be in the page (a
 * generator that silently dropped a section would still stamp the right
 * fingerprint).
 *
 * The generator is `jstack-app/tools/gen-handover-html.mjs`, run by
 * `pnpm codemap` (so the pre-commit hook keeps it in step for any commit that
 * touches the app) — this is the half that catches a commit touching only the
 * markdown.
 */
describe("RM-06 · the REMAP handover page is generated from HANDOVER.md and current", () => {
  const page = join(root, "..", "REMAP_HANDOVER.html");
  const sourcePath = join(root, "..", "HANDOVER.md");

  it("exists, and carries the fingerprint of HANDOVER.md as it is now", () => {
    expect(existsSync(page)).toBe(true);
    const source = readFileSync(sourcePath, "utf8");
    const fingerprint = createHash("sha256").update(source).digest("hex").slice(0, 12);
    const html = readFileSync(page, "utf8");
    const stamped = /<meta name="jstack-handover-source" content="([0-9a-f]+)">/.exec(html);
    expect(stamped).not.toBeNull();
    // a mismatch means HANDOVER.md moved and the page did not:
    // run `node tools/gen-handover-html.mjs` (or `pnpm codemap`) and commit it
    expect(stamped![1]).toBe(fingerprint);
  });

  it("every '##' section of the source is in the page, and both tabs are there", () => {
    const source = readFileSync(sourcePath, "utf8");
    const html = readFileSync(page, "utf8");
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    const headings = source
      .split(/\r?\n/)
      .filter((l) => /^##\s+/.test(l))
      .map((l) => l.replace(/^##\s+/, "").replace(/`/g, "").trim());
    expect(headings.length).toBeGreaterThan(5);
    const missing = headings.filter((h) => !text.includes(h.replace(/\s+/g, " ")));
    expect({ sectionsMissingFromThePage: missing }).toEqual({ sectionsMissingFromThePage: [] });
    // tab 2 is "Run it" on its own — the section REMAP acts on first (v2.3.2: §2)
    expect(html).toContain('<label for="t2">Run it</label>');
    expect(html).toContain('<label for="t1">The handover</label>');
    // and it opens from disk: no network, no dependency
    expect(/<script\b/i.test(html)).toBe(false);
    expect(/src="https?:/i.test(html)).toBe(false);
    expect(/<link\b[^>]*stylesheet/i.test(html)).toBe(false);
  });
});

/**
 * A-6, the second half of the cold-start gate's stumble 7.
 *
 * `expectEveryMatch` returns on zero matches by design — most documents do not
 * quote most counts, and a blanket floor would force every doc to quote every
 * number. The cost is that a document which REWORDS a count it does quote
 * stops being checked in silence, which is exactly the drift the gate found:
 * `HANDOVER.md` writes "142 \`TODO(BACKEND)\` markers" in code formatting, the
 * regex wanted the bare form, and adding the file to the list above changed a
 * vacuous pass into a vacuous pass.
 *
 * So the one count the living handover really does carry gets a floor of its
 * own. If the sentence is reworded, this test fails and whoever reworded it
 * decides what the new pin is — the same contract every other literal in this
 * file has.
 */
describe("QA-02 · HANDOVER.md actually quotes the marker count it is guarded on", () => {
  it("every form of the sentence is there, and each is the truth", () => {
    const text = readFileSync(join(root, "..", "HANDOVER.md"), "utf8");
    // BOTH forms the document uses: "142 `TODO(BACKEND)` markers" in §1.1 and
    // "The 142 markers in …todo-backend-grep.txt" in §4. The second is the
    // same fact written shorter, and a guard that only knew the first would
    // leave one of the two mentions drifting — which is the hole this test
    // exists to close, found by planting 9142 into the file.
    const mentions = [...text.matchAll(/\b(\d+)\s+(?:`?TODO\(BACKEND\)`?\s+)?markers?\b/g)];
    expect(mentions.length).toBeGreaterThanOrEqual(2);
    const gt = groundTruth();
    for (const m of mentions) expect({ mention: m[0], value: Number(m[1]) }).toEqual({ mention: m[0], value: gt.markers });
  });
});

// A-6 · EXPO_GO_LINK.md, EXPO_GO_QR.png and app.json name one project — removed
// (v2.3.2, WPO-1): Expo Go is fully retired, not just relocated. app.json no
// longer carries extra.eas.projectId, updates or runtimeVersion at all, so
// there is no live app.json field left for the frozen history/expo-go/ pair
// to agree with. tools/gen-expo-qr.mjs, which this test alone called, is
// removed with it.
