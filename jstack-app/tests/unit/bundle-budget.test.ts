/**
 * F-2 — the entry bundle has a budget, and it is the measured baseline plus
 * a little.
 *
 * A baseline nobody compares against is a snapshot. This is what turns
 * `evidence/perf-baseline.json` into a gate: the current production build's
 * entry must not be meaningfully bigger than the day it was measured. It is
 * allowed to grow — features are why — but it must not grow SILENTLY, which
 * is the only way 601 KB ever became 601 KB.
 *
 * The headroom is deliberate and small. A budget with no headroom fails on
 * noise and gets raised until it means nothing; a budget with lots of
 * headroom is not a budget.
 */
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const app = join(__dirname, "..", "..");
const BASELINE = join(app, "evidence", "perf-baseline.json");

/** 10% over the measured baseline. */
const HEADROOM = 1.1;

type Baseline = {
  measuredAt: string;
  entry: { gzipped: number; gzippedKb: number };
  scroll: { p95Ms: number };
  longTasks: { worstMs: number };
};

const baseline = (): Baseline => JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;

/**
 * The largest built entry, from the PRODUCTION dist first.
 *
 * T-1's mutation seam 8 found the order backwards: `pnpm build:web:prod`
 * writes `.jstack-dist-prod` and `pnpm build:web` writes `.jstack-dist`, and
 * this preferred the second — so a 282KB dummy import made the production
 * bundle 822KB against a 661KB budget and this test measured a stale
 * test-flavoured build of 615KB and passed. A budget that measures the wrong
 * artefact is not a budget.
 *
 * The dist it measured is reported in the failure, because "over budget" and
 * "over budget IN THE BUILD YOU THINK" are different sentences.
 */
function currentEntry(): { file: string; gzipped: number; dist: string } | null {
  for (const dist of [process.env.JSTACK_DIST, join(homedir(), ".jstack-dist-prod"), join(homedir(), ".jstack-dist")]) {
    if (dist == null) continue;
    const dir = join(dist, "_expo", "static", "js", "web");
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => ({ f, size: statSync(join(dir, f)).size }))
      .sort((a, b) => b.size - a.size);
    if (files.length === 0) continue;
    return { file: files[0].f, dist, gzipped: gzipSync(readFileSync(join(dir, files[0].f)), { level: 9 }).length };
  }
  return null;
}

describe("F-2 · the entry bundle stays inside its budget", () => {
  it("PF-01: the baseline exists and carries the numbers the budget is made of", () => {
    expect(existsSync(BASELINE)).toBe(true);
    const b = baseline();
    expect(b.entry.gzipped).toBeGreaterThan(100_000); // else it is not a real measurement
    expect(b.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("PF-04: the built entry is within 10% of the measured baseline", () => {
    const current = currentEntry();
    if (current == null) {
      // The board builds before it tests, so this only happens on a machine
      // that has never run `pnpm build:web`. Say so rather than pass quietly:
      // a budget that silently skips is not a budget.
      console.info("bundle-budget: no built entry found — run `pnpm build:web` first; skipping the comparison");
      return;
    }
    const budget = Math.round(baseline().entry.gzipped * HEADROOM);
    const overBy = current.gzipped - budget;
    expect({
      dist: current.dist,
      file: current.file,
      currentKb: Math.round(current.gzipped / 1024),
      budgetKb: Math.round(budget / 1024),
      overBudget: overBy > 0,
    }).toMatchObject({ overBudget: false });
  });

  it("the baseline's own thresholds are the ones F-2 reasoned about", () => {
    // If these change, the reasoning in B-25 no longer applies and F-2's
    // decisions (lazy tabs refused, blur refused) need re-making rather than
    // inheriting.
    const b = baseline();
    expect(b.entry.gzippedKb).toBeGreaterThan(400); // the bundle IS the problem
    expect(b.scroll.p95Ms).toBeLessThan(25); // scrolling is NOT the problem
  });
});

/**
 * A4R2-04 — the delivery documents' bundle sentence, checked against the
 * committed evidence.
 *
 * Four documents said "12.1% over budget, 689,899 gzipped against 677,137".
 * It was wrong three ways at once: 689,899 against 677,137 is 1.9%, not 12.1%;
 * neither figure described the tree (694,654 against a 761,274 budget); and
 * `evidence/perf-baseline.json`, cited as the evidence, held neither number.
 * SY-1's re-baselining had closed the gap the sentence described, and nobody
 * re-read the sentence. It sat in QA_REPORT §3's "what this board does NOT
 * prove" — the one section whose job is to tell a reader what to distrust.
 *
 * This pins the two numbers that come from COMMITTED files (the baseline and
 * the budget derived from it). It deliberately does NOT pin the measured entry
 * size: that is a build artefact, CI builds none, and a unit test that reads
 * one passes here and fails on the runner (B-17).
 */
describe("A4R2-04 · the documents' budget figures are the evidence's", () => {
  const docs = ["history/v22/HANDOVER_v22.md", "QA_REPORT_v22.md", "history/v22/CHANGES_v22.md", "history/v22/EXECUTION_HANDOFF_v22.md"];
  const fmt = (n: number) => n.toLocaleString("en-US");

  it("every document that states the budget states the one perf-baseline.json implies", () => {
    const b = baseline();
    const budget = Math.round(b.entry.gzipped * HEADROOM);
    const wrong: string[] = [];
    for (const name of docs) {
      const text = readFileSync(join(app, "..", name), "utf8");
      if (!/\bbudget\b/i.test(text)) continue;
      // any six-digit figure presented as a budget must be THE budget
      for (const m of text.matchAll(/([\d,]{7,}) budget\b/g)) {
        if (m[1] !== fmt(budget)) wrong.push(`${name}: "${m[1]} budget" but the baseline implies ${fmt(budget)}`);
      }
      for (const m of text.matchAll(/against a ([\d,]{7,})/g)) {
        if (m[1] !== fmt(budget)) wrong.push(`${name}: "against a ${m[1]}" but the baseline implies ${fmt(budget)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("and none of them still claims the bundle is over it", () => {
    const over = docs.filter((name) => /\d+(\.\d+)?% over (its )?budget/.test(readFileSync(join(app, "..", name), "utf8")));
    expect(over).toEqual([]);
  });
});
