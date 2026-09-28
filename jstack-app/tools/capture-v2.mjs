/**
 * `node tools/capture-v2.mjs` — the Stage 2 device pass (history/v2/BUILD_PLAN_v2.md row 21, QA-07).
 * Captures every audit screen from the PRODUCTION export at four widths × two schemes.
 * Prereq `pnpm build:web:prod`; serves `~/.jstack-dist-prod` on 4173 itself
 * (`JSTACK_DIST` overrides the folder). Frames land in
 * `../history/v22/demo/v22/<screen>-d<day>-<width>-<scheme>-<flavour>.png` (LV-09, QA-07). This
 * header said `demo/v2` until B-1 — a folder the rig stopped writing to at F-1, and
 * the released V2 pass that a stale line would have invited someone to overwrite.
 * WP-M (v2.3.1) moved `demo/` into `history/v22/demo/`, frozen there — nothing new is taken.
 * Three things it exists to get right:
 *
 * 1. PRODUCTION, so the audit judges what ships — `--prod` swaps the test modules out
 *    (SEC-01), so `__JSTACK__` (and with it `unlockForCapture`) does NOT exist here and the gate is opened
 *    the only way a user can: a real WebAuthn ceremony on a CDP virtual authenticator,
 *    exactly as `e2e/helpers.ts` installs one.
 * 2. ORIGIN — WebAuthn refuses an IP as an RP ID, so the base is `localhost`, not
 *    127.0.0.1 (the same reason playwright.config.ts's baseURL is).
 * 3. HEIGHT — `fullPage` measures the DOCUMENT and RNW does not scroll it; every screen
 *    scrolls an inner div (`tab-screen-today`: clientHeight 768, scrollHeight 1393 at
 *    1024), so `fullPage` alone cut frames off mid-card. `shot()` grows the viewport to
 *    the tallest inner scroller and restores it; the WIDTH never changes, so useLayout's
 *    768/1180 breakpoints and the column count are untouched.
 *
 * deviceScaleFactor 1: committed audit evidence, well under 400 KB a frame.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { sourceFingerprint } from "./source-fingerprint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const at = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
};
// V2.2's frames go in `demo/v22` (LV-09, QA-07). `demo/v21` is a released
// build's committed evidence, and a `--only` delta writes by NAME — pointed at
// v21 the first ★ review would have overwritten V2.1's own tasks frames with
// V2.2 screens carrying V2.1 file names, which is the shape B-35 is about:
// evidence has bugs, and the worst kind is a frame that looks right.
const PASS_DIR = join(here, "..", "..", "history", "v22", "demo", "v22");
const outDir = at("--out", PASS_DIR);

/**
 * A-2: the device pass is FOUR passes, and the file name says which.
 *
 *   `--day 1|2`         which fixture day (day 2 needs the rig, so it is
 *                       test-flavour only — a production build cannot be
 *                       told it is tomorrow, and pretending otherwise in a
 *                       file name would be the lie this flag exists to stop)
 *   `--flavour prod|test`  which build. `prod` is the one a person would
 *                       install: no `__JSTACK__`, no test modules. `test`
 *                       carries the rig, and is the only way to photograph a
 *                       state that has to be DRIVEN — an offline capture, a
 *                       proposed section, a live conversation.
 *
 * The flavour is PROBED in the browser rather than trusted from the path
 * (`assertFlavour` below). `~/.jstack-dist-prod` held a test-flavoured build
 * for part of this build, and a frame labelled `-prod` that came from the
 * test bundle is worse than no frame: it is evidence of something that was
 * never checked.
 */
const DAY = at("--day", "1");
const FLAVOUR = at("--flavour", "prod");
if (!["1", "2"].includes(DAY)) throw new Error(`--day must be 1 or 2, got ${DAY}`);
if (!["prod", "test"].includes(FLAVOUR)) throw new Error(`--flavour must be prod or test, got ${FLAVOUR}`);
if (DAY === "2" && FLAVOUR === "prod") throw new Error("--day 2 needs the rig, so it is test-flavour only");

const dist = process.env.JSTACK_DIST ?? join(homedir(), FLAVOUR === "prod" ? ".jstack-dist-prod" : ".jstack-dist");
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
/**
 * Every screen this pass must photograph, by name (R22-01). Four of them
 * are STATES rather than screens, and each was added only after a reviewer
 * proved the pass was blind to it: the bill decision card and the undo
 * toast (B-94/B-96), the toast over an open sheet (R17-01 — the one
 * arrangement in which a toast that has fallen behind every overlay looks
 * correct), and the emergency confirm dialog (B9-01, behind a 1.2s
 * press-and-hold, where a saturated fill survived eighteen review rounds
 * because no frame of it existed).
 */
const SCREENS = [
  "today",
  "tasks-list",
  "tasks-board",
  "tasks-gantt",
  "tasks-done",
  "task-detail",
  "brain",
  "life",
  "agents",
  "settings",
  "arrange",
  "arrange-life",
  "decision-history",
  "locked",
  "decision-bill",
  "decision-section",
  "life-config",
  "undo-toast",
  "toast-over-sheet",
  "emergency-confirm",
  // A-2: the three V2.1 states nobody could see in a frame before
  "sync",
  "offline",
  "talk",
  // K-1: the global Find, which is a modal at 1024 and up and a full-screen
  // surface at 393 — one component, two surfaces, and the delta review is the
  // only thing that looks at both.
  "find",
  // LH-1: the habit MONTH grid. One of Trends' four tabs and the one the other
  // three are judged against — Josh asked for a JSTACK version of the three
  // reference images he sent, and a frame is the only way that question gets
  // answered. Not `RIG_ONLY`: the Life card's own trends link opens it, which
  // is how a person opens it.
  //
  // NO DOUBLE-QUOTED LOWERCASE WORD BELONGS IN THIS COMMENT. `handover.test.ts`
  // reads this array as TEXT — every /"[a-z0-9-]+"/ between the opening bracket
  // and the closing one is a declared screen — so a quoted word in a comment is
  // a screen nobody declared, which is exactly what happened when this one was
  // written (QA-07 went red naming `trends` twice).
  "trends",
  // LH-1, ux round 1: the OTHER two tabs. The first pass photographed only the
  // month and the reviewer could answer four of its six questions — this is the
  // row that answers a complaint that the trend tabs were empty, so a pass that
  // shows one of four is the standing evidence gap A-2 exists to close. The
  // WEEK tab too, in the end. It was left out on the grounds that it is the
  // same strip the Life card carries — and the reviewer answered, twice, that
  // it cannot close "Trend tabs are empty" without seeing every tab. It is also
  // not quite the same component: in the dialog the strip carries the habit's
  // name, and on the card the name is the row's own column.
  "trends-week",
  "trends-year",
  "trends-all",
  // ST-1, ux round 1: the settings sheet's LOWER panels. An overlay is
  // photographed at the viewport on purpose — growing it to the page behind
  // stretches a dialog to two thousand pixels and lets the page ghost through
  // (K1-01, B3R1-01) — and the cost is that a long scrolling dialog is only
  // ever seen down to its first fold. Settings is six panels deep, so three of
  // ST-1's four changes were in no frame in the pass: the Rules card, the six
  // speeds and the silence options. These two open the sheet SCROLLED to the
  // panel that changed, which is the same answer the rig already gives for a
  // bill card and a toast over a sheet — a state, declared, rather than a
  // general rule about dialogs that would have to be right for all of them.
  "settings-rules",
  "settings-voice",
  // A-2 of Stage 6: the states LV-09 and QA-07 name that no frame held. The
  // completion dialog (TK-10, the one confirm in the app), a board card
  // mid-drag, the Gantt lane for tasks with no dates, a reply opened from
  // Brain, the files archive, two collapsed sections on Life, and a triage
  // card raised by a share — all reachable in a production build, the way a
  // person reaches them. The mic listening, and Sync with a queued capture
  // and then a conflict, have to be DRIVEN, so those three are in RIG_ONLY
  // below. The LH-1 rule above holds here too: no double-quoted lowercase
  // word in this comment, because the test reads the array as text.
  "task-complete",
  "board-drag",
  "gantt-unscheduled",
  "reply",
  "files-archive",
  "collapsed",
  "mic-listening",
  "sync-queued",
  "sync-conflict",
  "triage",
  // A-3 round 1 (S6-40): six things the A-1 checks ask a reviewer to judge had
  // no frame, so the auditor would have read silence as a pass. All reachable
  // the way a person reaches them, so both flavours: the task list with a
  // focus and a slicer applied and the clear control up; the mind-dump field
  // focused (a viewport frame, because the phone question is zoom and crop);
  // Today and Tasks each with sections collapsed (JQ-06 was on Tasks); the
  // Edit caps dialog; Agents after the emergency confirm was cancelled (the
  // hint under the button, AG-04); and the delegate picker (JQ-02).
  "tasks-filtered",
  "dump-focused",
  "today-collapsed",
  "tasks-collapsed",
  "caps-edit",
  "emergency-cancelled",
  "delegate-picker",
];

const WIDTHS = [[393, 852], [1024, 768], [1366, 900], [1920, 1080]];
/** the instant every pass is taken at (S6-37) — the afternoon of the day the V2.2 pass was first taken */
/**
 * The pass runs on ONE instant so it is pixel-reproducible (S6-37) — a
 * Thursday, which is a fine day to photograph and a blind spot for anything
 * that only happens on another one.
 *
 * `--instant <iso>` moves it, and `--out <dir>` sends the frames somewhere
 * that is not the pass. The two exist together and only together: an off-pass
 * instant must never write into `demo/v22`, because the pass's whole claim is
 * that every frame in it was taken at the same moment. Used at A-6 to
 * photograph the Gantt's Sunday, where `lib/ganttAxis.ts` absorbs a lead week
 * band too narrow to caption — a path no frame of a Thursday can reach
 * (ux round 4). The command is written into the evidence beside the frame.
 */
const FIXED_INSTANT = at("--instant", "2026-09-10T16:20:00+10:00");
if (Number.isNaN(new Date(FIXED_INSTANT).getTime())) throw new Error(`--instant is not a date: ${FIXED_INSTANT}`);
if (FIXED_INSTANT !== "2026-09-10T16:20:00+10:00" && resolve(outDir) === resolve(PASS_DIR)) {
  // D15 (the A-6 re-audit): this asked `outDir.endsWith("v22")`, and
  // `"../demo/v22/".endsWith("v22")` is false — so ONE trailing slash wrote
  // off-pass frames straight into the device pass, which is the single thing
  // the guard exists to prevent. A path is compared as a PATH now, resolved on
  // both sides, so every spelling of the pass directory is the pass directory.
  throw new Error("--instant needs an --out that is not the device pass: every frame in the pass is taken at one instant");
}

/**
 * `--check-only`: validate the arguments and stop, taking no frames.
 *
 * It exists so the guard above can be tested by running the REAL rig without
 * the test being able to photograph anything. The first version of that test
 * did not have it, and planting the old check to prove the case was red
 * started two captures on a Sunday clock that overwrote three frames of the
 * device pass — the exact contamination the guard exists to prevent, caused by
 * the test written to prove the guard works (`BUGLOG_v22.md` B-271).
 */
if (process.argv.includes("--check-only")) {
  console.log(`arguments ok: day ${DAY}, flavour ${FLAVOUR}, instant ${FIXED_INSTANT}, out ${outDir}`);
  process.exit(0);
}
const SCHEMES = ["light", "dark"];
const AUTH = { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };

/** the unlock ceremony fires an "Unlocked with Face ID" toast; a toast sitting in an
 * evidence frame reads as app state, so wait it out (helpers.ts does the same). */
async function settle(page) {
  await page.waitForTimeout(450);
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), undefined, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(150);
}

/** S6-45 (round 2): the page BEHIND an overlay frame was still laying out when the
 * overlay opened — the last Today card missing on prod, present on test, under one
 * name. Wait until the document's height holds still before opening anything over it. */
async function settledHeight(page) {
  let last = -1;
  for (let i = 0; i < 24; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h === last) return h;
    last = h;
    await page.waitForTimeout(250);
  }
  return last;
}

/**
 * `--only a,b,c` — capture just these screens (M-1, hard rule 10).
 *
 * Note the three STATE frames (undo-toast, toast-over-sheet,
 * emergency-confirm) write through `page.screenshot` directly rather than
 * through `shot()`, so they are gated at their own call sites. Gating only
 * `shot()` left them writing on every focused run, which the completeness
 * check then reported as "frames no screen is declared for" — the gate and
 * the check disagreeing about what the run was for.
 *
 * A ★ row reviews the surfaces its stage touched, not all seventeen: a
 * reviewer given 136 frames reviews none of them properly, and a full
 * capture is minutes of browser time per width x scheme. Names are the
 * `SCREENS` entries above. With no flag, everything is captured, so the
 * evidence run is unchanged.
 */
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  if (i === -1) return null;
  const names = (process.argv[i + 1] ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const unknown = names.filter((n) => !SCREENS.includes(n));
  if (unknown.length) throw new Error(`--only names ${unknown.join(", ")}, which ${unknown.length > 1 ? "are" : "is"} not in SCREENS`);
  if (names.length === 0) throw new Error("--only needs at least one screen name");
  return new Set(names);
})();

/**
 * Screens that need the rig to reach at all: a proposed section has to be
 * proposed, an offline state has to be forced, a conversation has to be
 * driven. They exist only in the test flavour, and the manifest below knows
 * it — rather than reporting them missing from every production pass.
 * A-2 of Stage 6 adds three: a headless browser has no microphone, and the
 * outbox and a refused replay are the rig's to arrange (OF-02, OF-07).
 */
const RIG_ONLY = new Set(["decision-section", "life-config", "offline", "talk", "mic-listening", "sync-queued", "sync-conflict"]);

const wanted_screen = (name) => (ONLY == null || ONLY.has(name)) && (FLAVOUR === "test" || !RIG_ONLY.has(name));
const wanted = wanted_screen;

async function shot(page, name, width, height, scheme) {
  // the navigation still happens (a screen's state often depends on the one
  // before it); only the file write is skipped
  if (!wanted(name)) return;
  await settle(page);
  const needed = await page.evaluate(() => {
    let max = document.documentElement.scrollHeight;
    for (const el of document.querySelectorAll("div")) {
      if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 120) {
        // A6-01: a scroller no longer runs to the bottom of the window. The
        // phone's page ends above the floating chrome's band (B-254), so the
        // gap BELOW the box is part of the height this frame needs — without
        // it the grown viewport is short by exactly that band, and the page is
        // cut through whatever card lies at the join. The A-6 review measured
        // 74 of 86 grown 393 frames cut through a card, one of them losing a
        // whole field ("How was today?") that `demo/v21` still shows.
        const box = el.getBoundingClientRect();
        const below = Math.max(0, window.innerHeight - box.bottom);
        max = Math.max(max, box.top + window.scrollY + el.scrollHeight + below);
      }
    }
    return Math.ceil(max);
  });
  // An OVERLAY is viewport-sized by definition (`Dialog`/`Sheet` mount at the
  // root and cover the screen). Growing the viewport to the page BEHIND it and
  // shooting fullPage stretches the dialog to two thousand pixels, spreads its
  // controls to opposite ends of a frame no person will ever see, and lets the
  // page ghost through a surface that is opaque in a real window — which is
  // how a reviewer reads "a modal with no container" off a correct app
  // (ux-review B3R1-01/B3R1-13, and the 1024 "centred in the document"
  // observation). Detected rather than declared per screen, so the next dialog
  // added cannot forget it.
  //
  // The grown viewport has a second cost, recorded here because a reviewer
  // has now read a defect off it twice: chrome positioned `absolute` against
  // the viewport (the demo watermark, the mic button, a toast) is anchored to
  // the GROWN one, so its distance from anything laid out in flow is not the
  // distance a person sees. Measured at a real 1366x900: watermark 838-852,
  // rail health 862-900, ten pixels clear. Judge that class of thing from an
  // overlay frame, or from a browser.
  // K1-01: an overlay is any registry surface that covers the viewport, which
  // is BOTH kinds — `Dialog`/`Sheet` carry a `*-backdrop` and a `screen` carries
  // `ScreenSurface`. The test used to name only the backdrop, so a `screen`
  // fell through to "grow the viewport to the tallest inner scroller" and
  // picked up the TAB STILL MOUNTED BEHIND IT: Find's phone frame came out
  // 2545px tall for 708px of content, and Talk's frames have the same fault.
  // One selector, both kinds — the alternative is a second rule that has to be
  // remembered the next time a kind is added.
  // S6-01 (A-3 round 1): the GATE is viewport-sized too. `locked` fell
  // through to "grow the viewport to the tallest inner scroller" — the Today
  // tab still mounted behind it — and the frame came out 2561 px tall at 393
  // with the wordmark 374 px below the fold. The reviewer read an empty lock
  // screen off it; in a real window the gate is the viewport (lock.spec.ts
  // "the locked screen is on screen at scroll 0" passes on the unchanged
  // tree). Same family as K1-01: the rig's frame was the defect.
  const overlay = await page.evaluate(
    () =>
      document.querySelector('[data-testid$="-backdrop"]') != null ||
      document.querySelector('[data-testid="screen-surface"]') != null ||
      document.querySelector('[data-testid="facelock"]') != null,
  );
  const grew = !overlay && needed > height + 4;
  if (grew) {
    await page.setViewportSize({ width, height: Math.min(needed, 8000) });
    await page.waitForTimeout(350);
  }
  await page.screenshot({ path: join(outDir, `${name}-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: !overlay });
  if (grew) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
  }
}

/**
 * The build the browser is actually running, checked rather than assumed.
 * `~/.jstack-dist-prod` held a test-flavoured build for part of this build,
 * and a frame labelled `-prod` that came from the test bundle is worse than
 * no frame: it is evidence of something nobody checked.
 */
async function assertFlavour(page) {
  const hasRig = await page.evaluate(() => window.__JSTACK__ != null);
  const expected = FLAVOUR === "test";
  if (hasRig !== expected) {
    throw new Error(`--flavour ${FLAVOUR} was served a build with ${hasRig ? "" : "no "}__JSTACK__ — rebuild with \`pnpm build:web${expected ? "" : ":prod"}\` (dist: ${dist})`);
  }
}

async function openLocked(page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.getByTestId("facelock").waitFor({ state: "visible", timeout: 20000 });
}

async function tab(page, name) {
  await page.getByTestId(`tab-${name}`).click();
  await page.waitForTimeout(250);
}

/** Settings is on the rail on desktop and in the header on phone. */
async function openSettings(page) {
  const rail = page.getByTestId("rail-settings");
  if (await rail.count()) await rail.click();
  else await page.getByTestId("header").getByLabel("Settings").click();
  await page.getByTestId("settings-sheet").waitFor({ state: "visible", timeout: 10000 });
}

async function captureOne(browser, [width, height], scheme) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme });
  // A-3 (S6-37): the pass runs on a FIXED INSTANT, not the machine clock. Two
  // things in every frame are clock-driven — the calendar's now-rule and the
  // agent feed's "N h ago" — and the round-1 review found them to be the
  // whole of the prod/test difference on the same screen and day (the rule
  // moved 4–6 px between two runs twenty minutes apart), so the pass could
  // never be pixel-reproducible. Playwright's clock starts at the instant and
  // flows from there at the real rate (probed: 1500 ms of wall time advanced
  // it 1515 ms, and a 300 ms timer fired at 303), so every timer the app
  // runs — the toast, the hold-to-lock, the undo countdown — is unchanged;
  // only "now" is. The fixtures are relative to now, so the day they seed is
  // the instant's day.
  await context.clock.install({ time: new Date(FIXED_INSTANT) });
  const page = await context.newPage();
  // R-06: the session stays `speaking` (mic deaf) until an utterance ENDS,
  // and a headless synthesiser has no voices and may never say so. The talk
  // frame drives audio right after Start, so the synthesiser is a stub that
  // talks — `onend` after a moment — exactly as e2e/core/talk.spec.ts does.
  await page.addInitScript(() => {
    class Utterance {
      constructor(text) {
        this.text = text;
        this.onend = null;
        this.onerror = null;
        this.rate = 1;
      }
    }
    // read-only accessors: a plain assignment is silently ignored
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    window.__spokenCount = 0;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: (u) => {
          window.__spokenCount += 1;
          setTimeout(() => u.onend?.(), 120);
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
  });
  const client = await context.newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", { options: AUTH });
  const phone = width < 768;

  await openLocked(page); // before any ceremony has run
  await shot(page, "locked", width, height, scheme);

  await assertFlavour(page);

  await page.getByTestId("facelock").click();
  await page.getByTestId("facelock").waitFor({ state: "detached", timeout: 20000 });
  await page.getByTestId("tab-today").waitFor({ state: "visible", timeout: 20000 });

  // A-2: day 2 is the morning after — expiries applied, a delegation
  // finished, the day's own fixtures. It needs the rig, which is why it is
  // test-flavour only and why the file name says so.
  if (DAY === "2") {
    await page.evaluate(() => window.__JSTACK__.reset("day2"));
    await page.waitForTimeout(400);
  }

  await shot(page, "today", width, height, scheme);

  // A-3 (S6-40): two of Today's sections collapsed (CL-01). Opened again
  // before the tab is left — the collapse is a saved preference, and every
  // frame after this one would inherit it.
  if (wanted_screen("today-collapsed")) {
    for (const id of ["calendar", "glance"]) {
      await page.getByTestId(`disclose-${id}`).scrollIntoViewIfNeeded();
      await page.getByTestId(`disclose-${id}`).click();
      await page.waitForTimeout(200);
    }
    await shot(page, "today-collapsed", width, height, scheme);
    for (const id of ["calendar", "glance"]) {
      await page.getByTestId(`disclose-${id}`).click();
      await page.waitForTimeout(200);
    }
    await page.getByTestId("disclose-calendar").waitFor({ state: "visible", timeout: 10000 });
  }

  if (!phone) {
    // Arrange is desktop-only (RL-05); the phone header offers Settings instead.
    await page.getByTestId("header").getByLabel("Arrange").click();
    await page.getByTestId("arrange-dialog").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "arrange", width, height, scheme);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  await openSettings(page);
  await shot(page, "settings", width, height, scheme);
  // the sheet's lower panels, scrolled to. `scrollIntoViewIfNeeded` rather than
  // the sheet's own section payload: the payload path animates, and a frame
  // taken mid-animation is a frame of nothing in particular.
  if (wanted_screen("settings-rules")) {
    await page.getByTestId("settings-rules").scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
    await shot(page, "settings-rules", width, height, scheme);
  }
  if (wanted_screen("settings-voice")) {
    await page.getByTestId("settings-voice").scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
    await shot(page, "settings-voice", width, height, scheme);
  }
  await page.getByTestId("settings-close").click();
  await page.waitForTimeout(250);

  await tab(page, "tasks");
  for (const [seg, name] of [["List", "tasks-list"], ["Board", "tasks-board"], ["Gantt", "tasks-gantt"], ["Done", "tasks-done"]]) {
    await page.getByTestId("task-seg").getByRole("tab", { name: seg }).click();
    await page.waitForTimeout(250);
    await shot(page, name, width, height, scheme);
  }

  // ── A-2 of Stage 6: a board card MID-DRAG (BD-04, LV-09) ───────────────
  //
  // The pass had the board at rest and never the gesture, and the gesture is
  // where the dimming of every other card is decided (Board.tsx, the 0.55).
  // The pointer goes down on t1, past `DRAG_THRESHOLD`, and stays there for
  // the frame; it is released back over the card's own lane, where
  // `moveTask` sees the same column and sends nothing (stores/taskEdits.ts).
  // Written through `page.screenshot` like the other state frames: `shot()`
  // resizes the viewport, and a viewport that changes under a held pointer
  // is a gesture nobody makes.
  if (wanted_screen("board-drag")) {
    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    const card = page.getByTestId("board-card-t1");
    await card.waitFor({ state: "visible", timeout: 10000 });
    await settle(page);
    const box = await card.boundingBox();
    if (box == null) throw new Error(`board-card-t1 has no box at ${width}/${scheme} — refusing to write a device pass without the drag frame`);
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // S6-35 (round 2, unproven): over its own lane a card shows no drop target by
    // design (B-140), so the frame could not show one — carry it to the NEXT lane
    // the lane ids are the fixture's column ids (`col-next`); a width that does not
    // show the lane falls back to the small move rather than waiting on it
    const lane = await page.getByTestId("board-lane-col-next").boundingBox({ timeout: 3000 }).catch(() => null);
    const to = lane != null ? { x: lane.x + lane.width / 2, y: lane.y + Math.min(lane.height / 2, 120) } : { x: from.x + 48, y: from.y + 28 };
    await page.mouse.move(from.x + 12, from.y + 6);
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
    await page.mouse.move(to.x, to.y);
    await page.waitForTimeout(300);
    await page.evaluate(() => document.fonts?.ready);
    await page.screenshot({ path: join(outDir, `board-drag-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: false });
    await page.mouse.move(from.x, from.y);
    await page.mouse.up();
    await page.waitForTimeout(250);
  }

  // ── A-2 of Stage 6: the Gantt lane for tasks with no dates (GT-07, LV-09) ─
  //
  // It is in the tasks-gantt frame above, at the foot of a chart `shot()`
  // grows the viewport for; this is the lane on its own, at the element, so a
  // reviewer judging its rows does not have to find them under the axis
  // first. An element frame rather than a page: the lane is the subject, and
  // the chart above it is already photographed.
  if (wanted_screen("gantt-unscheduled")) {
    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    const lane = page.getByTestId("task-views").getByTestId("gantt").getByTestId("gantt-unscheduled");
    await lane.waitFor({ state: "visible", timeout: 10000 });
    await settle(page);
    // S6-39: an element frame is cut from the VIEWPORT, so at 393 the fixed
    // chrome — the watermark, the mic orb, the tab bar — landed inside the
    // lane's box and covered three of its seven rows. Grow the viewport to
    // the document first, as `shot()` does: the fixed chrome then sits at the
    // grown bottom, far below the lane, and the frame is the lane alone.
    const laneNeeded = await page.evaluate(() => {
      let max = document.documentElement.scrollHeight;
      for (const el of document.querySelectorAll("div")) {
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 120) {
          // A6-01: a scroller no longer runs to the bottom of the window. The
          // phone's page ends above the floating chrome's band (B-254), so the
          // gap BELOW the box is part of the height the frame needs — without
          // it the grown viewport is short by exactly that band and the page
          // is cut through whatever card is at the join (74 of 86 grown 393
          // frames, the A-6 review).
          const box = el.getBoundingClientRect();
          const below = Math.max(0, window.innerHeight - box.bottom);
          max = Math.max(max, box.top + window.scrollY + el.scrollHeight + below);
        }
      }
      return Math.ceil(max);
    });
    await page.setViewportSize({ width, height: Math.min(Math.max(laneNeeded, height), 8000) });
    await page.waitForTimeout(350);
    await lane.screenshot({ path: join(outDir, `gantt-unscheduled-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`) });
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
  }

  await page.getByTestId("task-seg").getByRole("tab", { name: "List" }).click();
  await page.waitForTimeout(200);
  await page.getByTestId("task-open-t1").click(); // "Send Moz the sample pack"
  await page.getByTestId("task-detail").waitFor({ state: "visible", timeout: 10000 });
  await shot(page, "task-detail", width, height, scheme);
  await page.getByTestId("task-detail-close").click();
  await page.waitForTimeout(200);

  // ── A-2 of Stage 6: the completion dialog (TK-10, QA-07) ─────────────────
  //
  // The one confirm in the app, behind a tick on a task with open subtasks
  // (t1 has them), and no frame had ever shown it. Left the way the dialog
  // itself offers: the second verb opens the card instead, and the card is
  // closed as the task-detail frame's was. Nothing is completed.
  if (wanted_screen("task-complete")) {
    // Day 2 has no task with an open subtask: t1's last one finished
    // overnight (D2-04), so a tick would complete t1 outright and no dialog
    // would open — the first day-2 run died here waiting for one. A subtask
    // is added the way a person adds one, through the card, so the question
    // exists to photograph; day 1 asks it as seeded.
    if (DAY === "2") {
      await page.getByTestId("task-open-t1").click();
      await page.getByTestId("task-detail").waitFor({ state: "visible", timeout: 10000 });
      await page.getByTestId("subtask-input").fill("Chase the courier for a tracking number");
      await page.getByLabel("Add subtask").click();
      await page.getByTestId("subtasks").filter({ hasText: "Chase the courier" }).waitFor({ state: "visible", timeout: 10000 });
      await page.getByTestId("task-detail-close").click();
      await page.waitForTimeout(200);
    }
    await page.getByTestId("task-cb-t1").click();
    await page.getByTestId("complete-confirm").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "task-complete", width, height, scheme);
    await page.getByTestId("complete-confirm-no").click();
    await page.getByTestId("task-detail").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("task-detail-close").click();
    await page.waitForTimeout(200);
  }

  // A-3 (S6-40): the delegate picker (JQ-02 — it opened bottom-right, and
  // should be front and centre). t5 has no delegation yet, so the verb opens
  // the picker rather than the acknowledged state.
  if (wanted_screen("delegate-picker")) {
    await page.getByTestId("task-open-t5").click();
    await page.getByTestId("task-detail").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("task-delegate").click();
    await page.getByTestId("delegate-picker").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "delegate-picker", width, height, scheme);
    await page.getByTestId("delegate-picker-close").click();
    await page.getByTestId("delegate-picker").waitFor({ state: "detached", timeout: 10000 });
    await page.getByTestId("task-detail-close").click();
    await page.waitForTimeout(200);
  }

  // A-3 (S6-40): the list with a focus and a slicer applied — the active
  // filter row (TK-14) and the clear control (JQ-03) exist only in this
  // state. Cleared and the focus put back before the tab is left: the focus
  // is a saved preference that Today's cards read too.
  if (wanted_screen("tasks-filtered")) {
    // a focus, a slicer, and a filter from the panel — the active-filter row
    // (TK-14) is the panel's filters, shown with the panel closed; the chips
    // are their own evidence
    await page.getByTestId("focus-chips").getByText("Work", { exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByTestId("slicer-waiting").click();
    await page.waitForTimeout(250);
    await page.getByTestId("task-filter-open").click();
    await page.getByTestId("filter-dialog").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("filter-status-in_progress").click();
    await page.getByTestId("filter-apply").click();
    await page.getByTestId("task-active-filters").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "tasks-filtered", width, height, scheme);
    // every filter off again, the way a person turns them off
    await page.getByTestId("active-filter-status-in_progress").click();
    await page.getByTestId("task-active-filters").waitFor({ state: "detached", timeout: 10000 });
    const clear = page.getByTestId("task-clear");
    if (await clear.count()) await clear.click();
    await page.waitForTimeout(250);
    await page.getByTestId("focus-chips").getByText("Everything", { exact: true }).click();
    await page.waitForTimeout(250);
  }

  // A-3 (S6-40): the Waiting on section collapsed — JQ-06's report was that
  // collapsing it hid the Gantt. Opened again before the tab is left.
  if (wanted_screen("tasks-collapsed")) {
    await page.getByTestId("disclose-waiting-on").scrollIntoViewIfNeeded();
    await page.getByTestId("disclose-waiting-on").click();
    await page.waitForTimeout(200);
    await shot(page, "tasks-collapsed", width, height, scheme);
    await page.getByTestId("disclose-waiting-on").click();
    await page.waitForTimeout(200);
  }

  if (wanted_screen("find")) {
    // opened the way a person opens it: the rail at 768 and up, the header
    // glyph below. There is no rig here (production flavour), which is the
    // point — the entry points are what GS-02 and GS-03 are about.
    //
    // A4-04: this runs BEFORE the brain/life/agents loop, and must stay there.
    // Find is photographed OVER Today, and the loop opens `reply-act-r1` for
    // the `reply` frame — which marks it read, by design (RP-02). Today's
    // first column renders its reply card from `newestUnread(replies)`, so
    // once the pass has spent r1 the card is gone and the page behind Find is
    // a Today no fresh user would see. The test pass hid it by reseeding
    // through the rig; the production pass has no rig and could not, which is
    // exactly the prod/test difference on one screen and day that LV-09 calls
    // a defect (the reviewer's S6-45, carried through three rounds as a paint
    // race — `settledHeight` below was the fix for a race that was never
    // there). Ordering fixes it on BOTH flavours, which reseeding cannot.
    await tab(page, "today");
    await settledHeight(page);
    const rail = page.getByTestId("rail-find");
    if (await rail.count()) await rail.click();
    else await page.getByTestId("header").getByLabel("Find").click();
    await page.getByTestId("find-query").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("find-query").fill("steve");
    await page.getByTestId("find-query").press("Enter");
    await page.waitForTimeout(500);
    await shot(page, "find", width, height, scheme);
    await page.getByTestId("find-close").click();
    await page.waitForTimeout(250);
  }

  for (const t of ["brain", "life", "agents"]) {
    await tab(page, t);
    await shot(page, t, width, height, scheme);

    // B-3: Arrange on LIFE, which is the only tab that holds both kinds of
    // section — two components and four §4.10 config records. The `arrange`
    // frame above is Today's, where every row is a component, so it could
    // not show the thing B-2 changed (ux-review B3R1-12).
    if (t === "life" && !phone) {
      await page.getByTestId("header").getByLabel("Arrange").click();
      await page.getByTestId("arrange-dialog").waitFor({ state: "visible", timeout: 10000 });
      await shot(page, "arrange-life", width, height, scheme);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    // ── A-2 of Stage 6: two Brain surfaces and a Life state (LV-09) ────────
    //
    // A reply opened from the Replies section (RP-02). Opening marks it read,
    // which is the feature; the Brain frame above was taken first, unread.
    if (t === "brain" && wanted_screen("reply")) {
      const row = page.getByTestId("reply-act-r1");
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await page.getByTestId("reply").waitFor({ state: "visible", timeout: 10000 });
      await shot(page, "reply", width, height, scheme);
      await page.getByTestId("reply-close").click();
      await page.waitForTimeout(200);
    }
    // the files archive, opened from the Files section's own verb
    if (t === "brain" && wanted_screen("files-archive")) {
      const verb = page.getByTestId("files-verb");
      await verb.scrollIntoViewIfNeeded();
      await verb.click();
      await page.getByTestId("files-archive-dialog").waitFor({ state: "visible", timeout: 10000 });
      await shot(page, "files-archive", width, height, scheme);
      await page.getByTestId("files-archive-dialog-close").click();
      await page.waitForTimeout(200);
    }
    // A-3 (S6-40): the mind-dump field FOCUSED. A viewport frame, because the
    // phone question is whether the page zooms or crops when a field takes
    // focus (TE-01), and that is a fact about the viewport.
    if (t === "brain" && wanted_screen("dump-focused")) {
      await page.getByTestId("dump-input").scrollIntoViewIfNeeded();
      await page.getByTestId("dump-input").click();
      await page.waitForTimeout(400);
      await page.evaluate(() => document.fonts?.ready);
      await page.screenshot({ path: join(outDir, `dump-focused-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: false });
      await page.getByTestId("dump-input").blur();
      await page.waitForTimeout(200);
    }
    // two sections collapsed (CL-01): the heading stays and the body goes.
    // Both are opened again before the tab is left — the trends dialog below
    // opens from a link inside Habits, and a collapsed Habits has no link.
    if (t === "life" && wanted_screen("collapsed")) {
      for (const id of ["habits", "people"]) {
        await page.getByTestId(`disclose-${id}`).scrollIntoViewIfNeeded();
        await page.getByTestId(`disclose-${id}`).click();
        await page.waitForTimeout(200);
      }
      await shot(page, "collapsed", width, height, scheme);
      for (const id of ["habits", "people"]) {
        await page.getByTestId(`disclose-${id}`).click();
        await page.waitForTimeout(200);
      }
      await page.getByTestId("habits-trends").waitFor({ state: "visible", timeout: 10000 });
    }
  }

  await page.getByTestId("history-search").click(); // decision history, on Agents under Portals
  await page.getByTestId("agents-history-dialog").waitFor({ state: "visible", timeout: 10000 });
  await shot(page, "decision-history", width, height, scheme);
  await page.getByTestId("agents-history-dialog-close").click();
  await page.waitForTimeout(200);

  // Two STATES the pass could not previously show, so nobody could judge them:
  // the undo toast (settle() waits every toast out, by design — a toast in a
  // resting frame reads as app state) and the bill decision card (a waiting
  // row, never opened). The reviewer said plainly in round 10 that it could not
  // verify either fix from these frames; a shot each is the answer.
  await tab(page, "today");
  await page.getByTestId("waiting-open-c3").click(); // the RACQ bill card
  await page.getByTestId("decision-bill-c3").waitFor({ state: "visible", timeout: 10000 });
  await shot(page, "decision-bill", width, height, scheme);

  // B-3: the section proposal card. Two STATES nobody could judge before,
  // for the same reason as the bill card above — they exist only after an
  // interaction. The proposal has to be created here (the EA is not in the
  // app), through the same endpoint the backend will use, not by writing a
  // card into the fixtures: a frame of a hand-built card would not prove the
  // preview renders from a real config.
  if (wanted_screen("decision-section") || wanted_screen("life-config")) {
    await page.evaluate(() =>
      window.__JSTACK__.proposeSection(
        {
          id: "reading",
          tab: "life",
          title: "Reading",
          column: 3,
          configure: true,
          source: { endpoint: "/learning" },
          blocks: [{ type: "rows", idPrefix: "reading", bind: "learning.rows" }],
          version: 1,
          state: "proposed",
          managedBy: "ea",
          changedAt: "2026-09-01T09:00:00.000Z",
        },
        "You open Learning most mornings; this puts it where you look first.",
      ),
    );
    await page.getByTestId("waiting-open-sec-reading-1").click();
    await page.getByTestId("decision-section-reading").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "decision-section", width, height, scheme);

    // and the configure dialog it opens — the one surface in Life that a
    // capture pass has never included.
    await page.getByTestId("decision-revise-sec-reading-1").click();
    await page.getByTestId("life-config").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "life-config", width, height, scheme);
    await page.getByTestId("life-config-close").click();
    await page.waitForTimeout(200);

    // ux-review R1-06: the proposal is a real decision card once it is made,
    // and it stayed in the waiting rows of every frame captured after this
    // block on the test flavour — `undo-toast` and `toast-over-sheet` carried
    // a SECTION row that `today` and the prod pass did not, which is the
    // prod/test difference the pass exists to rule out. Reseed the day and
    // come back to Today, so the frames after this one show the same world
    // the prod pass photographs.
    await page.evaluate((day) => window.__JSTACK__.reset(day === "2" ? "day2" : undefined), DAY);
    await tab(page, "today");
    await page.getByTestId("waiting-open-c3").click();
    await page.getByTestId("decision-bill-c3").waitFor({ state: "visible", timeout: 10000 });
  }

  await page.getByTestId("decision-later-c3").click(); // any answer raises the undo toast
  await page.getByTestId("toast-undo").waitFor({ state: "visible", timeout: 10000 });
  // S6-46: the undo ring counts on the app's clock, so its digit raced the shutter
  // (10 on prod, 9 on test). Hold the clock where it stands for the two toast
  // frames — nothing they show needs a timer — and let it run again after.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts?.ready);
  if (wanted_screen("undo-toast")) await page.screenshot({ path: join(outDir, `undo-toast-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: false });

  // R17-01: the frame above is a toast over a BARE Today, which is the one
  // configuration in which a toast that has fallen behind every dialog and
  // sheet looks perfectly correct. Nine call sites raise a toast from inside
  // an overlay, so this is the state that actually needs photographing — and
  // the reviewer could only find the defect by driving the DOM, because the
  // pass had never taken this shot. Closing an evidence gap paid three
  // defects last time it was done (B-96); it is cheaper than the round it
  // saves.
  const settingsEntry = (await page.getByTestId("rail-settings").count())
    ? page.getByTestId("rail-settings")
    : page.getByTestId("header").getByLabel("Settings");
  await settingsEntry.click();
  await page.getByTestId("settings-sheet").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts?.ready);
  if (wanted_screen("toast-over-sheet")) await page.screenshot({ path: join(outDir, `toast-over-sheet-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: false });
  await page.clock.resume();

  // B9-01: the emergency confirm dialog, which no pass had ever photographed.
  // It sits behind a 1.2s press-and-hold, so eighteen review rounds judged the
  // Emergency CARD — correctly outlined — and never the dialog it opens, where
  // the same button had shipped as a saturated fill for a whole stage after
  // B-50 declared that fixed. A state that needs a gesture to reach is a state
  // nobody reviews.
  // Close the sheet the shot above needed. Every state this pass enters, it
  // must leave — the first version of this block did not, and the Agents tab
  // was unreachable behind an open Settings sheet, so the capture died on a
  // timeout after one width and left `demo/v2/` with 15 frames in it. A pass
  // that leaves state behind is a pass whose later frames depend on the order
  // of its earlier ones.
  await page.keyboard.press("Escape");
  await page.getByTestId("settings-sheet").waitFor({ state: "detached", timeout: 10000 });

  await tab(page, "agents");
  // The undo toast raised for the two toast frames above lives ten seconds,
  // and this hold used to land inside that window. It got away with it while
  // the phone toast sat at 90: the pill covered the button's lower edge only.
  // R-31 moved the pill above the demo watermark (122), the pill then sat on
  // the button's centre at 393, `mouse.down` pressed the toast, and all three
  // passes died here in 40 seconds (BUGLOG R-36). A pass that leaves state
  // behind is a pass whose later frames depend on the order of its earlier
  // ones — the rule this file states above the settings block — and a live
  // toast is state. Wait it out.
  await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), undefined, { timeout: 12000 });
  const hold = page.getByTestId("hold-to-lock");
  await hold.scrollIntoViewIfNeeded();
  const holdBox = await hold.boundingBox();
  // No `if (holdBox != null)` here. The first version of this block had one,
  // and the auditor pointed out what it bought: a null box would skip the
  // emergency frame in silence and reopen the exact gap B9-01 existed because
  // of — a screen nobody photographs is a screen nobody reviews. That is the
  // `if (await bill.count())` pattern of B-98 with a different subject. If the
  // button is not there, the pass should stop and say so.
  if (holdBox == null) throw new Error(`hold-to-lock has no box at ${width}/${scheme} — refusing to write a device pass without the emergency dialog`);
  {
    await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();
    await page.getByTestId("emergency-confirm").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.fonts?.ready);
    if (wanted_screen("emergency-confirm")) await page.screenshot({ path: join(outDir, `emergency-confirm-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: false });
  }

  // A-3 (S6-40): Agents after the confirm was CANCELLED — JOSH_QA item 13
  // said the hint under the button still read "locking" after a cancel, and
  // AG-04 says it returns to its resting text. A viewport frame of the same
  // place the hold began.
  if (wanted_screen("emergency-cancelled")) {
    await page.getByTestId("emergency-cancel").click();
    await page.getByTestId("emergency-confirm").waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts?.ready);
    await page.screenshot({ path: join(outDir, `emergency-cancelled-d${DAY}-${width}-${scheme}-${FLAVOUR}.png`), fullPage: false });
  }

  // A-3 (S6-40): the Edit caps dialog (JOSH_QA item 13 — "value units not
  // defined"). It asks for a fresh Face ID, which the virtual authenticator
  // answers as it did at the gate.
  if (wanted_screen("caps-edit")) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.getByTestId("spend-edit-caps").scrollIntoViewIfNeeded();
    await page.getByTestId("spend-edit-caps").click();
    await page.getByTestId("caps-dialog").waitFor({ state: "visible", timeout: 15000 });
    await shot(page, "caps-edit", width, height, scheme);
    await page.getByTestId("caps-cancel").click();
    await page.getByTestId("caps-dialog").waitFor({ state: "detached", timeout: 10000 });
  }

  // ── A-2: the three V2.1 states ────────────────────────────────────────
  //
  // Settings › Sync is reachable in any build; the other two have to be
  // DRIVEN, which is why they are in RIG_ONLY and why a production pass does
  // not claim them rather than quietly capturing an idle screen instead.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  if (wanted_screen("sync")) {
    await openSettings(page);
    await page.getByTestId("settings-sync").click();
    await page.getByTestId("sync-dialog").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "sync", width, height, scheme);
    await page.getByTestId("sync-dialog-close").click();
    await page.getByTestId("settings-close").click();
    await page.waitForTimeout(250);
  }

  if (wanted_screen("talk")) {
    await tab(page, "brain");
    // the offline capture above raises a "queued" toast, and at 1024 it sits
    // over the start button — settle() waits every toast out, which is why it
    // exists and why the frame before this one needs it too
    await settle(page);
    await page.getByTestId("talk-with-ea").click();
    await page.getByTestId("talk-screen").waitFor({ state: "visible", timeout: 10000 });
    // and again HERE, not just before opening the screen: going back online
    // replays the queued capture and raises "Synced · N captures" a moment
    // later, and at 1024 the start button sits at y=714 — exactly where a
    // toast lives. The first settle ran before that toast existed.
    await settle(page);
    await page.getByTestId("talk-start").scrollIntoViewIfNeeded();
    await page.getByTestId("talk-start").click();
    // the greeting must be spoken and DONE before any audio: the mic is deaf
    // while the EA speaks (R-06), and a chunk pushed over it is dropped
    await page.waitForFunction(() => window.__spokenCount >= 1, undefined, { timeout: 10000 });
    await page.getByTestId("talk-state").filter({ hasText: "listening" }).waitFor({ state: "visible", timeout: 10000 });
    await page.evaluate(async () => {
      const v = window.__JSTACK__.voice;
      await v.audio("a");
      await v.audio("b");
      await v.audio("c");
    });
    await page.waitForTimeout(400);
    await page.getByTestId("talk-reply").click();
    await page.waitForTimeout(700);
    await shot(page, "talk", width, height, scheme);
    await page.getByTestId("talk-end").click();
    await page.waitForTimeout(250);
  }

  // one visit, three frames: the dialog is opened when ANY of its tabs is
  // wanted, because a `--only trends-year` run must still get there
  if (["trends", "trends-week", "trends-year", "trends-all"].some((n) => wanted_screen(n))) {
    // the MONTH tab, not the week: the week strip is already on the Life card
    // behind this dialog, and the month grid is the view Josh's reference
    // images are about. Opened from the Life card's own "trends" link.
    await tab(page, "life");
    await page.getByTestId("habits-trends").click();
    await page.getByTestId("trends-dialog").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("trends-period").getByRole("tab", { name: "Month" }).click();
    await page.getByTestId("habit-month-caption").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(400);
    if (wanted_screen("trends")) await shot(page, "trends", width, height, scheme);

    if (wanted_screen("trends-week")) {
      await page.getByTestId("trends-period").getByRole("tab", { name: "Week" }).click();
      await page.getByTestId("trend-row-h1").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      await shot(page, "trends-week", width, height, scheme);
    }
    if (wanted_screen("trends-year")) {
      await page.getByTestId("trends-period").getByRole("tab", { name: "Year" }).click();
      await page.getByTestId("habit-year-caption").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      await shot(page, "trends-year", width, height, scheme);
    }
    if (wanted_screen("trends-all")) {
      await page.getByTestId("trends-period").getByRole("tab", { name: "All time" }).click();
      await page.getByTestId("habit-all-h1").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      await shot(page, "trends-all", width, height, scheme);
    }

    await page.getByTestId("trends-dialog-close").click();
    await page.waitForTimeout(250);
  }

  if (wanted_screen("offline")) {
    // a capture made with no connection, rendered as what it is: kept, not
    // sent. The queued line is the whole point of this frame.
    await tab(page, "brain");
    await page.evaluate(() => window.__JSTACK__.goOffline());
    await page.getByTestId("dump-input").fill("Ring the school about the Term 4 dates");
    await page.getByTestId("dump-send").click();
    await page.waitForTimeout(600);
    await shot(page, "offline", width, height, scheme);
    await page.evaluate(() => window.__JSTACK__.goOnline());
    await page.waitForTimeout(600);
  }

  // ── A-2 of Stage 6: the driven states LV-09 names ───────────────────────
  //
  // Three need the rig and are in RIG_ONLY: the microphone (a headless
  // browser has none; `mic.use` installs the one MC-01's tests use), the
  // outbox with an entry in it, and a conflict the server was told to raise.
  if (wanted_screen("mic-listening")) {
    await tab(page, "brain");
    await settle(page);
    await page.evaluate(() => window.__JSTACK__.mic.use({}));
    const mic = page.getByTestId("dump-mic");
    await mic.scrollIntoViewIfNeeded();
    await mic.click();
    await page.getByTestId("dump-mic-state").filter({ hasText: "Listening" }).waitFor({ state: "visible", timeout: 10000 });
    // S6-47: the transcript streams into the field as muted text (BRAIN_PROPOSAL
    // row 1, MC-04); the frame showed the placeholder because the headless rig
    // had said nothing. The lever's interim result, as the browser would stream it.
    await page.evaluate(() => window.__JSTACK__.mic.partial("Ring the school about the Term 4 dates, and ask whether the swim carnival forms are due"));
    await page.waitForFunction(() => (document.querySelector('[data-testid="dump-input"]')?.value ?? "").includes("swim carnival"), undefined, { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot(page, "mic-listening", width, height, scheme);
    await mic.click(); // the same button stops it (MC-02)
    await page.getByTestId("dump-input").fill(""); // the interim text is this frame's, not the next's
    await page.getByTestId("dump-mic-state").waitFor({ state: "detached", timeout: 10000 });
  }

  if (wanted_screen("sync-queued") || wanted_screen("sync-conflict")) {
    // Settings › Sync with something in it. The first frame is the queue: a
    // capture made offline, waiting. The second is the conflict: the server
    // told to refuse that entry on replay (OF-07), the connection back, and a
    // second capture queued behind it — so one frame holds both rows, which
    // is the arrangement the "Could not be applied" block is judged in.
    await tab(page, "brain");
    await settle(page);
    await page.evaluate(() => window.__JSTACK__.goOffline());
    await page.getByTestId("dump-input").fill("Ask Priya whether the Q3 numbers went to the board");
    await page.getByTestId("dump-send").click();
    await page.waitForFunction(async () => (await window.__JSTACK__.outbox()).length === 1, undefined, { timeout: 10000 });
    await openSettings(page);
    await page.getByTestId("settings-sync").click();
    await page.getByTestId("sync-dialog").waitFor({ state: "visible", timeout: 10000 });
    await page.locator('[data-testid^="sync-queued-"]').first().waitFor({ state: "visible", timeout: 10000 });
    if (wanted_screen("sync-queued")) await shot(page, "sync-queued", width, height, scheme);
    await page.getByTestId("sync-dialog-close").click();
    await page.getByTestId("settings-close").click();
    await page.waitForTimeout(250);

    if (wanted_screen("sync-conflict")) {
      const [entry] = await page.evaluate(() => window.__JSTACK__.outbox());
      await page.evaluate((id) => window.__JSTACK__.forceConflict(id), entry.offlineId);
      await page.evaluate(() => window.__JSTACK__.goOnline());
      await page.waitForFunction(() => window.__JSTACK__.sync().conflicts.length === 1, undefined, { timeout: 10000 });
      await settle(page); // the sync toast
      await page.evaluate(() => window.__JSTACK__.goOffline());
      await page.getByTestId("dump-input").fill("Book the dentist for the kids before term ends");
      await page.getByTestId("dump-send").click();
      await page.waitForFunction(async () => (await window.__JSTACK__.outbox()).length === 1, undefined, { timeout: 10000 });
      await openSettings(page);
      await page.getByTestId("settings-sync").click();
      await page.getByTestId(`sync-conflict-${entry.offlineId}`).waitFor({ state: "visible", timeout: 10000 });
      await page.locator('[data-testid^="sync-queued-"]').first().waitFor({ state: "visible", timeout: 10000 });
      await shot(page, "sync-conflict", width, height, scheme);
      await page.getByTestId(`sync-dismiss-${entry.offlineId}`).click();
      await page.getByTestId("sync-dialog-close").click();
      await page.getByTestId("settings-close").click();
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => window.__JSTACK__.goOnline());
    await settle(page);
  }

  if (wanted_screen("triage")) {
    // ── A-2 of Stage 6: a triage card from a share (UP-05, UP-09, LV-09) ──
    //
    // A share arrives BY URL, to an app that is usually locked (UP-04), so
    // the page is navigated rather than the store called; the storage is
    // cleared first so the gate fronts the route as it does for a person,
    // the ceremony runs again on the same virtual authenticator, and the
    // words are in the field when they are through — one tap files them as
    // a share, because the route remembered what they were. LAST in the pass
    // on purpose: the navigation reloads the app and the in-process mock with
    // it, so every state driven above is gone, and on day 2 the rig seeds the
    // morning after again, after the gate and before the send.
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/capture#url=https%3A%2F%2Fafr.com%2Fdental-rollups&title=Dental%20roll-ups`, { waitUntil: "load" });
    await page.getByTestId("facelock").waitFor({ state: "visible", timeout: 20000 });
    await page.getByTestId("facelock").click();
    await page.getByTestId("facelock").waitFor({ state: "detached", timeout: 20000 });
    await page.getByTestId("brain-entry").waitFor({ state: "visible", timeout: 15000 });
    if (DAY === "2") {
      await page.evaluate(() => window.__JSTACK__.reset("day2"));
      await page.waitForTimeout(400);
    }
    const field = await page.getByTestId("dump-input").inputValue();
    if (!field.includes("Dental")) throw new Error(`the share did not land in the field at ${width}/${scheme} (the field holds "${field}") — refusing to write a triage frame of a typed note`);
    await page.getByTestId("dump-send").click();
    await settle(page);
    await tab(page, "today");
    const card = page.locator('[data-testid^="decision-triage-"]');
    await page.locator('[data-testid^="decision-triage-"], [data-testid^="waiting-open-tr-"]').first().waitFor({ state: "visible", timeout: 10000 });
    if ((await card.count()) === 0) await page.locator('[data-testid^="waiting-open-tr-"]').first().click();
    await card.first().waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "triage", width, height, scheme);
  }

  await context.close();
}

async function main() {
  // A FULL pass wipes first, so a screen that no longer exists cannot linger
  // as evidence. A `--only` pass must NOT (B-31): it captures a handful of
  // screens and would delete every frame it is not about, turning a delta
  // review into a device pass with eighteen screens missing. Each shot
  // overwrites its own file, so there is nothing to clean.
  mkdirSync(outDir, { recursive: true });
  if (ONLY == null) {
    // Empty the directory's CONTENTS rather than removing the directory.
    // `demo/v2` lives inside Dropbox, which holds a handle on the folder, so
    // `rmSync(dir)` fails EPERM on Windows — AFTER deleting the files inside
    // it. A full pass therefore wiped the evidence and then aborted before
    // capturing a single replacement frame (B-31).
    // only THIS pass's files: the directory holds four passes
    for (const f of readdirSync(outDir)) {
      if (f.endsWith(`-${FLAVOUR}.png`) && f.includes(`-d${DAY}-`)) rmSync(join(outDir, f), { force: true });
    }
  }
  // A-2: refuse to run against SOMEBODY ELSE'S server.
  //
  // `serve-web.mjs` binds the port or exits; if Playwright's webServer is
  // still up from an e2e run (it serves `~/.jstack-dist`, the TEST build,
  // and `reuseExistingServer` leaves it running), this spawn loses the bind
  // and every frame comes from the wrong build with the right name on it.
  // Found by the flavour probe on the first production pass — which is what
  // the probe is for, and is the same family as B-35: evidence has bugs.
  const taken = await fetch(BASE, { method: "HEAD" }).then(() => true).catch(() => false);
  if (taken) {
    console.error(`port ${PORT} is already serving something. Stop it first — a capture that loses the bind photographs whatever is there and labels it with the flavour you asked for.`);
    process.exit(1);
  }
  // A-3: the served build is CHECKED against the tree, not assumed. build-web
  // stamps every export with `.jstack-source.json` — a content fingerprint of
  // the source it came from (B-03; tools/source-fingerprint.mjs) — and a pass
  // on a stale export photographs source that is not HEAD's under file names
  // that say it is. The flavour probe below catches the wrong BUILD; this
  // catches the right build of the wrong SOURCE, which is the quieter of the
  // two. The fingerprint is printed with the pass so the evidence names the
  // build it came from.
  const stampPath = join(dist, ".jstack-source.json");
  if (!existsSync(stampPath)) {
    console.error(`${dist} carries no .jstack-source.json — rebuild it with \`pnpm build:web${FLAVOUR === "prod" ? ":prod" : ""}\` before capturing`);
    process.exit(1);
  }
  const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
  const tree = sourceFingerprint(join(here, ".."));
  if (stamp.hash !== tree.hash) {
    console.error(`the export at ${dist} was built from source ${String(stamp.hash).slice(0, 12)} at ${stamp.at}; the tree is ${tree.hash.slice(0, 12)} — rebuild before capturing`);
    process.exit(1);
  }
  const server = spawn(process.execPath, [join(here, "serve-web.mjs"), String(PORT)], { env: { ...process.env, JSTACK_DIST: dist }, stdio: "inherit" });
  await new Promise((r) => setTimeout(r, 900));
  // Playwright's headless Chromium adds `--hide-scrollbars`, so NO scrollbar
  // can appear in any frame — the device pass was structurally blind to the
  // pack's own "5px thumb" rule, which is how R2-02's fix looked unfixed
  // (ux-review R3, observations). Opting out is what makes the rule evidenced.
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  let failed = null;
  try {
    for (const size of WIDTHS) {
      for (const scheme of SCHEMES) {
        process.stdout.write(`capturing ${size[0]}-${scheme}… `);
        await captureOne(browser, size, scheme);
        console.log("ok");
      }
    }
  } catch (e) {
    failed = e;
  } finally {
    await browser.close();
    server.kill();
  }
  if (failed) {
    console.error(failed);
    process.exit(1);
  }
  // R22-01: BY NAME, not by count. The first version of this derived its
  // `screens` list FROM the files it had just written and compared the
  // total against that, so the expectation fell in lockstep with the
  // output: the reviewer re-ran the expression against the real filenames
  // and found that 16 of 17 whole families could vanish with exit 0 —
  // including `emergency-confirm`, which the throw twenty lines above
  // exists to protect. A guard whose expectation is computed from its
  // subject is not a guard, and this build has now shipped that shape
  // fifteen times.
  //
  // So the families are DECLARED. Adding a screen means adding it here,
  // which is the point: the pass should not be able to quietly stop
  // photographing something.
  const written = new Set(readdirSync(outDir).filter((f) => f.endsWith(".png")));
  const wanted = new Set();
  for (const screen of SCREENS) {
    for (const [w] of WIDTHS) {
      for (const scheme of ["light", "dark"]) {
        // RL-05: Arrange is desktop-only, so it has no phone frame.
        if ((screen === "arrange" || screen === "arrange-life") && w === 393) continue;
        // and a production pass does not claim a state it cannot reach
        if (FLAVOUR === "prod" && RIG_ONLY.has(screen)) continue;
        // A `--only` run is a DELTA, not an evidence pass: the frames it did
        // not ask for are absent on purpose, and reporting them as missing
        // would make every focused ★ review print a red herring.
        if (!wanted_screen(screen)) continue;
        wanted.add(`${screen}-d${DAY}-${w}-${scheme}-${FLAVOUR}.png`);
      }
    }
  }
  const missing = [...wanted].filter((f) => !written.has(f)).sort();
  // The EXTRAS check is a full-pass claim only. In a delta every frame the run
  // did not ask for is still on disk from the pass before it — correctly, that
  // is the point — and reporting them as undeclared exits 1 on a run that did
  // exactly what it was told (the mirror of the `missing` exemption above).
  // and only this pass's own files: `demo/v22` holds every day and flavour,
  // so a prod pass must not report the test pass's frames as undeclared
  const mine = [...written].filter((f) => f.endsWith(`-${FLAVOUR}.png`) && f.includes(`-d${DAY}-`));
  const extra = ONLY != null ? [] : mine.filter((f) => !wanted.has(f)).sort();
  if (missing.length > 0 || extra.length > 0) {
    if (missing.length > 0) console.error(`device pass is MISSING ${missing.length} frame(s): ${missing.slice(0, 8).join(", ")}`);
    if (extra.length > 0) console.error(`device pass wrote ${extra.length} frame(s) no screen is declared for: ${extra.slice(0, 8).join(", ")}`);
    process.exit(1);
  }
  // say which it was: a full evidence pass and a --only delta are different
  // claims, and a line that reports "17 declared screens" after capturing 5
  // is the kind of output someone later quotes as proof of the wrong thing
  const scope = ONLY == null ? `all ${SCREENS.length} declared screens` : `${ONLY.size} of ${SCREENS.length} screens (--only delta)`;
  const pass = `day ${DAY}, ${FLAVOUR} build`;
  console.log(`
device pass written to ${outDir} — ${pass} — ${mine.length} frames this pass, ${written.size} in the directory, ${scope}, none missing — source ${tree.hash.slice(0, 12)}, export built ${stamp.at}`);
}

main();
