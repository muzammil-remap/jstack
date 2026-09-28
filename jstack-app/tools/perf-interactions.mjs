/**
 * Perceived speed of the everyday interactions, measured on the PRODUCTION
 * export at 393 and 1366 (Stage 5d hunt 14 of `18_CC_V22_SIMPLIFY_PROMPT.md`; Josh, 10 Sep).
 *
 * `tools/perf-baseline.mjs` measures the page LOAD (entry bytes, first paint,
 * a scripted scroll) and unlocks through the test rig, so it can only see the
 * test flavour. This measures what a person feels AFTER the app is open — a
 * tab switch, the first keystroke into the capture field, a card opening, a
 * tick, a filter, a collapse, Find, Talk — and it opens the production build
 * the only way a person can: a real WebAuthn ceremony on a CDP virtual
 * authenticator, exactly as `tools/capture-v2.mjs` does.
 *
 * Two numbers per interaction, and they answer different questions:
 *
 *   wall ms    from the tap being dispatched to the target being visible, as
 *              Playwright sees it. It INCLUDES Playwright's own round trip
 *              (a few ms) and its visibility poll (up to a frame), so it is a
 *              ceiling, and it is compared against itself: the same instrument
 *              before and after a row.
 *   long ms    the main-thread work over 50 ms that the browser reported
 *              during that window (`PerformanceObserver` on `longtask`). This
 *              is the half a finger feels as "the app froze", and it is the
 *              number that decides whether a structural smell is also a lag.
 *
 * Each interaction is driven THREE times in a fresh context and the MEDIAN is
 * kept — one sample is a coin toss (A-1's lesson in perf-baseline.mjs).
 *
 * The Gantt drag is measured and NOT gated: a drag is pointer arithmetic over
 * a scrolling axis and its number is a fact to record, not a rule to enforce.
 *
 * Run: `pnpm build:web:prod` first, then `node tools/perf-interactions.mjs
 * [--runs 3] [--port 4175] [--out evidence/perf-interactions.json]`. It serves
 * `~/.jstack-dist-prod` itself (`JSTACK_PROD_DIST` overrides) and refuses a
 * port that is already serving something, for capture-v2's reason: a run that
 * loses the bind measures whatever is there and labels it with this build.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const at = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
};
const RUNS = Number(at("--runs", "3"));
const PORT = Number(at("--port", "4175"));
const OUT = at("--out", join(root, "evidence", "perf-interactions.json"));
const DIST = process.env.JSTACK_PROD_DIST ?? join(homedir(), ".jstack-dist-prod");
const BASE = `http://localhost:${PORT}`;
const WIDTHS = [
  { width: 393, height: 830 },
  { width: 1366, height: 900 },
];
const AUTH = { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };

/** the long tasks reported since the last read, in ms */
async function longTasksSince(page, mark) {
  return page.evaluate((from) => {
    const list = window.__lt ?? [];
    return list.slice(from).reduce((n, d) => n + d, 0);
  }, mark);
}
const longTaskMark = (page) => page.evaluate(() => (window.__lt ?? []).length);

/** time one gesture: `act()` dispatches it, `until()` resolves when its effect is on screen */
async function timed(page, act, until) {
  const mark = await longTaskMark(page);
  const t0 = performance.now();
  await act();
  await until();
  const wall = performance.now() - t0;
  // the observer delivers on the next task, so give it one
  await page.waitForTimeout(60);
  const long = await longTasksSince(page, mark);
  return { wall: Math.round(wall), long: Math.round(long) };
}

const visible = (page, testId) => () => page.getByTestId(testId).waitFor({ state: "visible", timeout: 15000 });
const gone = (page, testId) => () => page.getByTestId(testId).waitFor({ state: "detached", timeout: 15000 });

async function openUnlocked(browser, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: size.width < 768, timezoneId: "Australia/Brisbane" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__lt.push(Math.round(entry.duration));
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // not observable here; the column reads 0 and the header says why
    }
  });
  const client = await context.newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", { options: AUTH });
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.getByTestId("facelock").waitFor({ state: "visible", timeout: 20000 });
  const hasRig = await page.evaluate(() => window.__JSTACK__ != null);
  if (hasRig) throw new Error(`${DIST} is a TEST build (it carries __JSTACK__) — run pnpm build:web:prod first`);
  await page.getByTestId("facelock").click();
  await page.getByTestId("facelock").waitFor({ state: "detached", timeout: 20000 });
  await page.getByTestId("tab-today").waitFor({ state: "visible", timeout: 20000 });
  // the unlock toast: a toast in a timing window is a paint that is not the interaction's
  await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), undefined, { timeout: 12000 }).catch(() => {});
  return { context, page };
}

/** a scripted scroll of a tab's own scroller; the p95 frame gap is what a finger feels */
async function scrollFrames(page, testId) {
  return page.getByTestId(testId).evaluate(async (root) => {
    const el = [root, ...root.querySelectorAll("*")].find((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4) ?? root;
    const gaps = [];
    let last = performance.now();
    for (let i = 0; i < 40; i++) {
      el.scrollTop += 40;
      await new Promise((r) =>
        requestAnimationFrame(() => {
          const now = performance.now();
          gaps.push(now - last);
          last = now;
          r();
        }),
      );
    }
    el.scrollTop = 0;
    const sorted = [...gaps].sort((a, b) => a - b);
    return { p50: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10, p95: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] * 10) / 10 };
  });
}

/**
 * The everyday interactions, in the order a day goes. Each returns {wall, long}.
 * Names are stable: the row P-D re-runs this and compares by name.
 */
async function measureOnce(browser, size) {
  const phone = size.width < 768;
  const { context, page } = await openUnlocked(browser, size);
  const out = {};
  try {
    const tab = (name) => timed(page, () => page.getByTestId(`tab-${name}`).click(), visible(page, `tab-screen-${name}`));
    out["tab: today→tasks"] = await tab("tasks");
    out["tab: tasks→brain"] = await tab("brain");

    // the capture field: first keystroke, then (touch) the expanded editor
    await page.getByTestId("dump-input").scrollIntoViewIfNeeded();
    if (phone) {
      out["capture: focus → expanded editor"] = await timed(
        page,
        () => page.getByTestId("dump-input").focus(),
        () => page.waitForFunction(() => document.body.hasAttribute("data-editor-expanded"), undefined, { timeout: 5000 }),
      );
    } else {
      await page.getByTestId("dump-input").focus();
    }
    out["capture: first keystroke"] = await timed(
      page,
      () => page.keyboard.type("a"),
      () => page.waitForFunction(() => document.querySelector('[data-testid="dump-input"]')?.value === "a", undefined, { timeout: 5000 }),
    );
    await page.keyboard.press("Backspace");
    await page.getByTestId("dump-input").blur();
    if (phone) await page.waitForTimeout(200);

    // Find: open, type, first result
    out["find: open"] = await timed(
      page,
      async () => {
        const rail = page.getByTestId("rail-find");
        if (await rail.count()) await rail.click();
        else await page.getByTestId("header").getByLabel("Find").click();
      },
      visible(page, "find-query"),
    );
    await page.getByTestId("find-query").fill("steve");
    out["find: Enter → first group"] = await timed(page, () => page.getByTestId("find-query").press("Enter"), visible(page, "find-group-task"));
    await page.getByTestId("find-close").click();
    await page.getByTestId("find").waitFor({ state: "detached", timeout: 10000 });

    // Talk: open the screen, and close it
    out["talk: open"] = await timed(page, () => page.getByTestId("talk-with-ea").click(), visible(page, "talk-screen"));
    await page.getByTestId("talk-close").click();
    await page.getByTestId("talk-screen").waitFor({ state: "detached", timeout: 10000 });

    out["tab: brain→life"] = await tab("life");
    out["detail: goal open"] = await timed(page, () => page.getByTestId("goal-g1").click(), visible(page, "goal-title"));
    await page.getByTestId("goal-close").click();
    await page.getByTestId("goal").waitFor({ state: "detached", timeout: 10000 });
    out["collapse: habits"] = await timed(page, () => page.getByTestId("disclose-habits").click(), gone(page, "life-week-h1"));
    await page.getByTestId("disclose-habits").click();
    await page.getByTestId("life-week-h1").waitFor({ state: "visible", timeout: 10000 });

    out["tab: life→agents"] = await tab("agents");
    out["tab: agents→today"] = await tab("today");
    out["collapse: glance"] = await timed(page, () => page.getByTestId("disclose-glance").click(), gone(page, "glance-goals"));
    await page.getByTestId("disclose-glance").click();
    await page.getByTestId("glance-goals").waitFor({ state: "visible", timeout: 10000 });

    // Tasks: card open/close, tick, filter, board, list scroll
    await page.getByTestId("tab-tasks").click();
    await page.getByTestId("tab-screen-tasks").waitFor({ state: "visible", timeout: 15000 });
    out["task card: open"] = await timed(page, () => page.getByTestId("task-open-t1").click(), visible(page, "task-detail"));
    out["task card: close"] = await timed(page, () => page.getByTestId("task-detail-close").click(), gone(page, "task-detail"));
    out["task: tick (no subtasks)"] = await timed(page, () => page.getByTestId("task-cb-t5").click(), visible(page, "toast-undo"));
    await page.getByTestId("toast-undo").click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), undefined, { timeout: 12000 }).catch(() => {});
    out["filter: open dialog"] = await timed(page, () => page.getByTestId("task-filter-open").click(), visible(page, "filter-dialog"));
    await page.getByTestId("filter-priority-high").click();
    out["filter: apply → list"] = await timed(page, () => page.getByTestId("filter-apply").click(), visible(page, "active-filter-priority-high"));
    await page.getByTestId("task-clear").click();
    await page.getByTestId("task-active-filters").waitFor({ state: "detached", timeout: 10000 });
    out["scroll: tasks list (frames)"] = await scrollFrames(page, "tab-screen-tasks");
    out["view: list→board"] = await timed(page, () => page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click(), visible(page, "board-scroll"));
    out["view: board→gantt"] = await timed(page, () => page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click(), visible(page, "gantt-axis"));

    // the Gantt drag: measured, not gated (mouse at 1366; the phone's touch hold is a gesture the drag test owns)
    if (!phone) {
      const bar = await page.getByTestId("task-views").getByTestId("gantt-bar-t7").boundingBox();
      if (bar != null) {
        const from = { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 };
        out["gantt: drag 2 days → undo toast"] = await timed(
          page,
          async () => {
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            await page.mouse.move(from.x + 20, from.y);
            await page.mouse.move(from.x + 40, from.y);
            await page.mouse.move(from.x + 56, from.y);
            await page.mouse.up();
          },
          visible(page, "toast-undo"),
        );
        await page.getByTestId("toast-undo").click();
      }
    }
    await page.getByTestId("task-seg").getByRole("tab", { name: "List" }).click();

    // Settings sheet
    out["settings: open sheet"] = await timed(
      page,
      async () => {
        const rail = page.getByTestId("rail-settings");
        if (await rail.count()) await rail.click();
        else await page.getByTestId("header").getByLabel("Settings").click();
      },
      visible(page, "settings-sheet"),
    );
    await page.getByTestId("settings-close").click();
  } finally {
    await context.close();
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  const taken = await fetch(BASE, { method: "HEAD" }).then(() => true).catch(() => false);
  if (taken) {
    console.error(`port ${PORT} is already serving something. Stop it, or pass --port.`);
    process.exit(1);
  }
  const stamp = JSON.parse(readFileSync(join(DIST, ".jstack-source.json"), "utf8"));
  const server = spawn(process.execPath, [join(here, "serve-web.mjs"), String(PORT)], { env: { ...process.env, JSTACK_DIST: DIST }, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch();
  const result = { measuredAt: new Date().toISOString(), source: stamp.hash.slice(0, 12), runs: RUNS, widths: {} };
  try {
    for (const size of WIDTHS) {
      const samples = [];
      for (let i = 0; i < RUNS; i++) {
        process.stdout.write(`${size.width} run ${i + 1}/${RUNS}… `);
        samples.push(await measureOnce(browser, size));
        console.log("ok");
      }
      const names = [...new Set(samples.flatMap((s) => Object.keys(s)))];
      const rows = {};
      for (const name of names) {
        const xs = samples.map((s) => s[name]).filter(Boolean);
        if (xs[0].wall != null) rows[name] = { wall: median(xs.map((x) => x.wall)), long: median(xs.map((x) => x.long)), samples: xs.map((x) => x.wall) };
        else rows[name] = { p50: median(xs.map((x) => x.p50)), p95: median(xs.map((x) => x.p95)) };
      }
      result.widths[size.width] = rows;
    }
  } finally {
    await browser.close();
    server.kill();
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");

  // the table, as the review reads it
  const names = [...new Set(Object.values(result.widths).flatMap((w) => Object.keys(w)))];
  console.log(`\n| interaction | 393 wall ms | 393 long ms | 1366 wall ms | 1366 long ms |`);
  console.log(`|---|---|---|---|---|`);
  for (const name of names) {
    const a = result.widths[393]?.[name];
    const b = result.widths[1366]?.[name];
    const cell = (r) => (r == null ? "—" : r.wall != null ? `${r.wall}` : `p50 ${r.p50} / p95 ${r.p95}`);
    const longCell = (r) => (r == null || r.wall == null ? "—" : `${r.long}`);
    console.log(`| ${name} | ${cell(a)} | ${longCell(a)} | ${cell(b)} | ${longCell(b)} |`);
  }
  console.log(`\nwritten: ${OUT} (source ${result.source}, ${RUNS} runs, medians)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
