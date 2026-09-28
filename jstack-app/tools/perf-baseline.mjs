/**
 * The performance baseline (F-1) — measured once, written down, and used to
 * decide what F-2 is allowed to spend effort on.
 *
 * The point is NOT to make numbers go down. It is to know which numbers are
 * worth touching: an optimisation applied without a baseline is a guess that
 * costs complexity forever and buys something nobody measured. F-2 applies
 * only what this justifies, and re-measures.
 *
 * What it records, and why each one:
 *
 *   entry size (gzipped)  what a phone on a train downloads before anything
 *                         renders. The single number most likely to matter.
 *   FCP                   when the person first sees something that is not a
 *                         blank page
 *   long tasks            main-thread blocks over 50ms — the difference
 *                         between "slow" and "broken" to a finger
 *   scroll frames         a scripted scroll down Today with per-frame timings;
 *                         the p95 is what a person feels as jank
 *   JS heap + DOM nodes   from CDP, because a leak shows here long before it
 *                         shows anywhere else
 *
 * Run: `node tools/perf-baseline.mjs [--url http://localhost:4173]`. Needs a
 * served build (`pnpm build:web` then `node tools/serve-web.mjs 4173`).
 */
import { chromium } from "playwright";
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const URL_UNDER_TEST = at("--url", "http://localhost:4173");
const DIST = process.env.JSTACK_DIST ?? join(homedir(), ".jstack-dist");

/** The entry bundle, gzipped — what actually crosses the wire. */
function entrySize() {
  const dir = join(DIST, "_expo", "static", "js", "web");
  if (!existsSync(dir)) return { file: null, bytes: 0, gzipped: 0 };
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ f, size: statSync(join(dir, f)).size }))
    .sort((a, b) => b.size - a.size);
  if (files.length === 0) return { file: null, bytes: 0, gzipped: 0 };
  const bytes = readFileSync(join(dir, files[0].f));
  return { file: files[0].f, bytes: bytes.length, gzipped: gzipSync(bytes, { level: 9 }).length };
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 100) / 100;
};

async function measure(url = URL_UNDER_TEST) {
  const browser = await chromium.launch();
  // a phone-shaped viewport: the device this has to be quick on
  const context = await browser.newContext({ viewport: { width: 393, height: 830 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    const w = window;
    w.__perf = { longTasks: [], frames: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__perf.longTasks.push(Math.round(entry.duration));
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // longtask is not observable in every build; the array stays empty and
      // the report says so rather than pretending zero
    }
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  const started = Date.now();
  await page.goto(url, { waitUntil: "load" });
  const loadMs = Date.now() - started;

  // FCP can be recorded after `load` resolves, so wait for the entry rather
  // than reading once and reporting null — a null here reads as "we did not
  // measure it", which is exactly the kind of gap a baseline must not have.
  const paint = await page.evaluate(async () => {
    const read = () => performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
    for (let i = 0; i < 40 && read() == null; i++) await new Promise((r) => setTimeout(r, 50));
    const fcp = read();
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      allPaints: performance.getEntriesByType("paint").map((e) => ({ name: e.name, ms: Math.round(e.startTime) })),
    };
  });

  // unlock and land on Today, which is the screen this is about
  await page.evaluate(() => (window.__JSTACK__ ? window.__JSTACK__.unlockForCapture() : undefined)).catch(() => {});
  await page.waitForTimeout(600);

  // a scripted scroll with per-frame timings — the p95 is what a finger feels
  const frames = await page.evaluate(async () => {
    const gaps = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    };
    for (let i = 0; i < 40; i++) {
      window.scrollBy(0, 40);
      await new Promise((r) => requestAnimationFrame(() => { tick(); r(undefined); }));
    }
    return gaps;
  });

  const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const longTasks = await page.evaluate(() => window.__perf.longTasks);

  await browser.close();
  return { loadMs, paint, frames, metrics, longTasks };
}

/**
 * THREE loads, and the median of each metric (A-1).
 *
 * One sample was enough to record a baseline and is not enough to compare
 * against one. Four consecutive runs of this tool against an unchanged build
 * produced worst-long-task figures of 116, 109, 88 and 105 ms — a spread of
 * ±30% around the median, against a 10% regression threshold. Gating on a
 * single sample of that metric is a coin toss, and a coin toss that fails is
 * worse than no check: it teaches whoever runs it to ignore the result.
 *
 * The median of three is still cheap (three page loads) and is stable enough
 * that a real regression shows and noise does not.
 */
const RUNS = process.argv.includes("--compare") ? 3 : 1;
/**
 * `--reference-url <url>` (A-0 review, R-04): the honest comparison is a
 * same-run A/B. The F-1 bytes that recorded 300 ms FCP measured 412 ms on
 * the same laptop a day later; the within-run spread of three loads was
 * 6–8%. The noise lives BETWEEN runs — machine state — so a recorded number
 * cannot be the yardstick for a 10% rule. With a reference build served on
 * another port (e.g. the F-1 commit's own `pnpm build:web:prod`), the loads
 * alternate reference / candidate and the verdict is the ratio of the two
 * medians measured in the same minute. The recorded baseline stays the
 * yardstick for the entry size, which does not drift.
 */
const REFERENCE_URL = at("--reference-url", null);
const samples = [];
const referenceSamples = [];
for (let i = 0; i < RUNS; i++) {
  if (REFERENCE_URL != null) referenceSamples.push(await measure(REFERENCE_URL));
  samples.push(await measure());
}
const median = (pick) => {
  const xs = samples.map(pick).sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)];
};
const { loadMs, paint, frames, metrics, longTasks } = samples[samples.length - 1];
const entry = entrySize();

const baseline = {
  measuredAt: new Date().toISOString().slice(0, 10),
  url: URL_UNDER_TEST,
  viewport: "393x830",
  entry: { file: entry.file, bytes: entry.bytes, gzipped: entry.gzipped, gzippedKb: Math.round(entry.gzipped / 1024) },
  load: { loadMs, firstContentfulPaintMs: paint.fcp, paints: paint.allPaints },
  longTasks: { count: longTasks.length, totalMs: longTasks.reduce((a, b) => a + b, 0), worstMs: longTasks.length ? Math.max(...longTasks) : 0 },
  scroll: { frames: frames.length, medianMs: percentile(frames, 50), p95Ms: percentile(frames, 95), worstMs: Math.round(Math.max(...frames) * 100) / 100 },
  runtime: {
    jsHeapUsedMb: Math.round(((metrics.JSHeapUsedSize ?? 0) / 1024 / 1024) * 10) / 10,
    domNodes: metrics.Nodes ?? 0,
    layoutCount: metrics.LayoutCount ?? 0,
  },
};

const out = join(root, "evidence", "perf-baseline.json");

/**
 * `--compare` reports against the recorded baseline and writes NOTHING (A-1).
 *
 * Without it this tool overwrites the very file it is being compared to,
 * which makes "re-run and compare" impossible to do twice: the first run
 * replaces the number the second would have measured against. A
 * re-measurement is not a new baseline unless somebody says it is.
 */
const COMPARE = process.argv.includes("--compare");
const TOLERANCE = 1.1;

if (COMPARE) {
  if (!existsSync(out)) {
    console.error("--compare: no recorded baseline at evidence/perf-baseline.json");
    process.exitCode = 2;
  } else {
    const was = JSON.parse(readFileSync(out, "utf8"));
    const refMedian = (pick) => {
      const xs = referenceSamples.map(pick).sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)];
    };
    // the yardstick per metric: the reference build measured in this run when
    // one was served, else the recorded baseline (which only the entry size
    // can honestly be held to — see the comment above `REFERENCE_URL`)
    const yard = (recorded, pick) => (REFERENCE_URL != null ? refMedian(pick) : recorded);
    const fcp = (m) => m.paint.fcp ?? 0;
    const worst = (m) => (m.longTasks.length ? Math.max(...m.longTasks) : 0);
    const p95 = (m) => percentile(m.frames, 95);
    const nodes = (m) => m.metrics.Nodes ?? 0;
    const rows = [
      // the medians, not the last sample — see the comment above `RUNS`
      ["entry gzipped KB", was.entry.gzippedKb, () => baseline.entry.gzippedKb],
      ["first contentful paint ms", yard(was.load.firstContentfulPaintMs, fcp), fcp],
      ["worst long task ms", yard(was.longTasks.worstMs, worst), worst],
      ["scroll p95 ms", yard(was.scroll.p95Ms, p95), p95],
      ["dom nodes", yard(was.runtime.domNodes, nodes), nodes],
    ];
    /**
     * A-0 review (R-04): the verdict says what the instrument can hear.
     *
     * The F-1 bytes that recorded 300 ms FCP recorded 412 ms a day later on
     * the same laptop, and four runs of HEAD's unchanged build spread from
     * 324 to 456 — so a 10% threshold is inside the instrument's own noise,
     * and "REGRESSED" over it was a claim the measurement could not make. Each
     * metric prints its three samples, and a metric whose own spread exceeds
     * the tolerance is reported NOISY rather than judged: exit 2 (inconclusive)
     * instead of exit 1 (regressed), so a board reading the code cannot take
     * a coin toss for a verdict either way. The honest instrument is a same-run
     * A/B against a reference BUILD, which CARRIED_DEFECTS_v21.md records.
     */
    let regressed = 0;
    let noisy = 0;
    for (const [label, before, pick] of rows) {
      const xs = samples.map(pick).map((v) => Math.round(v * 10) / 10);
      const now = median(pick);
      const spread = xs.length > 1 && now > 0 ? (Math.max(...xs) - Math.min(...xs)) / now : 0;
      // a floor keeps 0 -> 1 from reading as an infinite regression: three
      // long tasks becoming four is the signal, not the ratio
      const ratio = before <= 1 ? (now <= before + 1 ? 1 : 2) : now / before;
      const bad = ratio > TOLERANCE;
      const unresolvable = spread > TOLERANCE - 1;
      const verdict = bad && unresolvable ? "NOISY    " : bad ? "REGRESSED" : "ok       ";
      if (bad && unresolvable) noisy++;
      else if (bad) regressed++;
      const detail = xs.length > 1 ? ` (samples ${xs.join(" / ")}, spread ${Math.round(spread * 100)}%)` : "";
      console.log(`${verdict} ${label}: ${before} -> ${now}${detail}`);
    }
    console.log(`
compared against ${REFERENCE_URL != null ? `the reference build at ${REFERENCE_URL}, measured in this run (entry size against the ${was.measuredAt} record)` : `${was.measuredAt} — a RECORDED number, which drifts between runs; serve the reference build and pass --reference-url for a verdict that is evidence`}; ${regressed} of ${rows.length} regressed by more than ${Math.round((TOLERANCE - 1) * 100)}%${noisy > 0 ? `; ${noisy} inconclusive — the samples' own spread exceeds the threshold, so no verdict is evidence` : ""}`);
    if (regressed > 0) process.exitCode = 1;
    else if (noisy > 0) process.exitCode = 2;
  }
} else {
  writeFileSync(out, JSON.stringify(baseline, null, 2) + "\n");
  console.log(JSON.stringify(baseline, null, 2));
  console.log(`\nwritten: ${out}`);
}
