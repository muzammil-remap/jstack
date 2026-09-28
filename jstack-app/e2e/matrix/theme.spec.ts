/**
 * RL-08 — text-clipping sweep across every tab, every width × scheme (all
 * eight matrix projects, so dark gets the same coverage as light). Checks
 * two things per text node: `scrollWidth > clientWidth` (a genuinely
 * clipped/overflowing line — RN Web still lays text out in a plain DOM
 * text node even with `numberOfLines`, so this catches both a hard
 * `ellipsizeMode` clip and an unbreakable word/URL blowing out its box)
 * and, for a node whose rendered rects show it wrapped onto more than one
 * visual line, a last line so short it reads as an orphaned single
 * character (measured by rect width against the node's own font size,
 * since a DOM text node carries no per-line text split to count from).
 */
import { clickSettingsEntry, expect, gotoTab, openApp, openUnlocked, pickProject, test, unlock, type Tab } from "../helpers";
import { contrastRatio } from "../lib/contrast";
import { horizontalScrollViolations, labelInNameViolations, overlapViolations, touchTargetViolations, unnamedControlViolations } from "../lib/sweeps";

const TABS: Tab[] = ["today", "tasks", "brain", "life", "agents"];

type Finding = { kind: "clipped" | "orphan"; tag: string; text: string };

async function sweep(page: import("@playwright/test").Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const findings: { kind: "clipped" | "orphan"; tag: string; text: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? "").trim();
      if (text === "") continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;

      // Two legitimate reasons a node measures scrollWidth > clientWidth
      // that are NOT what RL-08 means by "clipped": a clientWidth-0
      // structural wrapper (RN Web nests a Text-as-container around
      // TaskRow's title+meta pair, say, that renders no box of its own —
      // nothing to clip against), and deliberate single-line ellipsis
      // truncation (`textOverflow: ellipsis` — a visible "…" affordance,
      // e.g. every list-row title in this app; confirmed by inspecting
      // the DOM, not assumed). RL-08's actual target is content cut with
      // NO such affordance — a hard, unindicated clip.
      if (parent.clientWidth > 0 && style.textOverflow !== "ellipsis" && parent.scrollWidth > parent.clientWidth + 1) {
        findings.push({ kind: "clipped", tag: parent.tagName, text: text.slice(0, 60) });
      }

      const range = document.createRange();
      range.selectNodeContents(node);
      // `getClientRects()` on a wrapped pre-wrap text node throws in a
      // degenerate ~3-4px rect for the whitespace character AT the wrap
      // point, on the same line as the text before it — not a real line
      // of its own, so a width floor well under one real character
      // (fontSize * 0.3) drops those before judging what the LAST real
      // line is.
      const fontSize = parseFloat(style.fontSize) || 14;
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > fontSize * 0.3 && r.height > 0);
      if (rects.length > 1) {
        const last = rects[rects.length - 1];
        // a rect-width proxy can't count characters directly (a text node
        // carries no per-line split), so the threshold is calibrated
        // narrow — roughly one average character, not "a short word": a
        // real 3-char word ("in.", 393px width, this app's own Health
        // ghost card) measured ~1x fontSize and must NOT trip this, since
        // RL-08 asks for single-CHARACTER orphans specifically.
        if (last.width < fontSize * 0.9) {
          findings.push({ kind: "orphan", tag: parent.tagName, text: text.slice(0, 60) });
        }
      }
    }
    return findings;
  });
}

test.describe("RL-08 text-clipping sweep", () => {
  test("no clipped text and no single-character orphan lines, on any tab", async ({ page }) => {
    await openUnlocked(page);
    const all: Finding[] = [];
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      all.push(...(await sweep(page)).map((f) => ({ ...f, text: `[${tab}] ${f.text}` })));
    }
    expect(all, JSON.stringify(all, null, 2)).toEqual([]);
  });
});

test.describe("GL-05 touch-target floor", () => {
  test("every interactive element is >= 36px on phone", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 768, "the 36px floor is phone-specific (GL-05); wider tiers have room to spare");
    await openUnlocked(page);
    const all: { kind: string; detail: string }[] = [];
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      all.push(...(await touchTargetViolations(page, 36)).map((v) => ({ ...v, detail: `[${tab}] ${v.detail}` })));
    }

    // ...and the OVERLAYS. AUDIT_v2.md AA-03: this walked the five tab screens
    // and nothing else, so every dialog and sheet close button sat at 20 x 20
    // and three spending-cap inputs had no accessible name, none of it visible
    // to the row that exists to catch exactly that. Same gap the GL-07 sweep
    // had (B-58) — a sweep that only visits tabs cannot see a dialog.
    const overlays: [string, () => Promise<void>, string][] = [
      ["settings", async () => void (await page.getByTestId("header").getByLabel("Settings").click()), "settings-close"],
      ["task-detail", async () => {
        await gotoTab(page, "tasks");
        await page.getByTestId("task-open-t1").click();
      }, "task-detail-close"],
      ["decision-history", async () => {
        await gotoTab(page, "agents");
        await page.getByTestId("history-search").click();
      }, "agents-history-dialog-close"],
      ["caps", async () => {
        await gotoTab(page, "agents");
        await page.getByTestId("spend-edit-caps").click();
      }, "caps-dialog-close"],
    ];
    // B4-01/B4-02: the sweep only ever measured a screen at rest, so the Undo
    // control (54 x 18) and a bill card's copy links (23 x 13) were never in
    // one. Both are transient STATES, not screens — so the sweep enters them.
    await gotoTab(page, "today");
    await page.getByTestId("decision-later-c1").click(); // any answer raises the undo toast
    await page.getByTestId("toast-undo").waitFor({ state: "visible" });
    all.push(...(await touchTargetViolations(page, 36)).map((v) => ({ ...v, detail: `[undo-toast] ${v.detail}` })));
    await page.getByTestId("toast-undo").click();
    await page.waitForTimeout(300);

    // AUDIT_v2.md B5-02: this used to guard on `if (await bill.count())`, and
    // c3 is a WAITING ROW that nothing in the sequence above opens — so the
    // count was 0, the branch never ran, and the sweep reported clean over a
    // state it had never entered. A `count()` guard around an unreachable
    // state turns a missing assertion into a passing one, which is the same
    // shape as every other guard-reports-green defect in this log. The row is
    // opened, and the measurement is unconditional.
    await page.getByTestId("waiting-open-c3").click();
    await page.getByTestId("decision-bill-c3").waitFor({ state: "visible" });
    all.push(...(await touchTargetViolations(page, 36)).map((v) => ({ ...v, detail: `[bill-card] ${v.detail}` })));

    for (const [name, open, close] of overlays) {
      await open();
      await page.waitForTimeout(250);
      all.push(...(await touchTargetViolations(page, 36)).map((v) => ({ ...v, detail: `[${name}] ${v.detail}` })));
      const closer = page.getByTestId(close);
      if (await closer.count()) await closer.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    expect(all, JSON.stringify(all, null, 2)).toEqual([]);
  });
});

/**
 * LK-01 / GL-03 — the gate follows the active theme. It painted `dark.ground`
 * unconditionally (a v1.2 carry-over comment in Gate.tsx), so `locked-*-light`
 * and `locked-*-dark` came out byte-identical in the row-21 device pass — the
 * ux-reviewer's D30. The pack has no exemption for it: README Accessibility,
 * "Theme follows the system; the toggle overrides for the session", and
 * handoff.md Behaviour, "Set the page background … to the theme ground".
 */
test.describe("LK-01/GL-03 the gate is themed", () => {
  test("the locked backdrop paints the ACTIVE theme's ground, not always dark", async ({ page }, testInfo) => {
    const { scheme } = pickProject(testInfo.project.name);
    await openApp(page);
    const bg = await page.getByTestId("facelock").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(scheme === "dark" ? "rgb(25, 24, 21)" : "rgb(237, 235, 229)");
  });
});

/**
 * GL-07 — no raw machine date or timestamp reaches the screen. README Content:
 * "Times: 24-hour in lists (`15:00`), spoken form in prose (`2:00pm`). Dates:
 * `4 September`, `19 Sep` in tight spaces." The row-21 device pass had Today's
 * subtitle reading `2026-09-04` on the same baseline as "Friday", and Agents'
 * heartbeat printing `last 2026-09-04T09:41:00.000Z` — a full ISO-8601 stamp
 * with milliseconds and a Z, on screen (ux-review D26).
 *
 * A sweep rather than four assertions: these strings are composed in the mock's
 * own fixtures and handlers, so the next one added would arrive the same way.
 */
const ISO_ON_SCREEN = /\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/;

test.describe("GL-07 dates and times are written for a person", () => {
  test("no ISO date or timestamp is rendered on any tab", async ({ page }) => {
    await openUnlocked(page);
    const offenders: string[] = [];
    const scan = async (where: string) => {
      const found = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = (node.textContent ?? "").trim();
          if (text !== "" && /\d{4}-\d{2}-\d{2}/.test(text)) out.push(text.slice(0, 80));
        }
        return out;
      });
      offenders.push(...found.map((t) => `[${where}] ${t}`));
    };
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      const found = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = (node.textContent ?? "").trim();
          if (text !== "" && /\d{4}-\d{2}-\d{2}/.test(text)) out.push(text.slice(0, 80));
        }
        return out;
      });
      offenders.push(...found.map((t) => `[${tab}] ${t}`));
    }

    // ...and the dialogs. R2-04: task detail's Activity row printed
    // `ea · 2026-09-04` through round 1, because the first version of this
    // sweep only walked the five tab screens and never opened anything.
    await gotoTab(page, "tasks");
    await page.getByTestId("task-open-t1").click();
    await page.getByTestId("task-detail").waitFor({ state: "visible" });
    await scan("task-detail");
    await page.getByTestId("task-detail-close").click();

    await gotoTab(page, "agents");
    await page.getByTestId("history-search").click();
    await page.getByTestId("agents-history-dialog").waitFor({ state: "visible" });
    await scan("decision-history");
    await page.getByTestId("agents-history-dialog-close").click();

    const settingsEntry = page.getByTestId("rail-settings");
    if (await settingsEntry.count()) await settingsEntry.click();
    else await page.getByTestId("header").getByLabel("Settings").click();
    await page.getByTestId("settings-sheet").waitFor({ state: "visible" });
    await scan("settings");

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
    expect(ISO_ON_SCREEN.source).toBeTruthy();
  });

  /**
   * TD-05's other half (D-1, ADR-47): no BARE clock either.
   *
   * "09:41" on its own is a time in some zone, and the reader has no way to
   * know which — that is what the app printed before D-1, sliced straight out
   * of an instant's ISO string. Prose gets a twelve-hour time with a day
   * attached ("Today 9:41am") through `formatWhen`.
   *
   * Two places keep a bare 24-hour clock and both are deliberate: the calendar
   * RAILS and list, where the column of hours is the axis README Content
   * specifies, and Settings' time-of-day VALUES (quiet hours, a schedule, the
   * voice cue), which are settings rather than descriptions of an instant.
   * Exempted by ancestor testID rather than by tab, so a new surface cannot
   * inherit the exemption by being rendered in the wrong place.
   */
  test("no bare clock outside the calendar and Settings' own values (TD-05)", async ({ page }) => {
    await openUnlocked(page);
    const offenders: string[] = [];
    const sweep = async (where: string) => {
      const found = await page.evaluate(() => {
        const EXEMPT = ["calendar-grid", "cal-", "calendar-list", "settings-", "quiet-", "schedule-", "voice-"];
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = (node.textContent ?? "").trim();
          if (text === "" || !/(^|\s)\d{1,2}:\d{2}(\s|$)/.test(text)) continue;
          let el: HTMLElement | null = node.parentElement;
          let exempt = false;
          while (el != null && !exempt) {
            const id = el.getAttribute("data-testid");
            if (id != null && EXEMPT.some((prefix) => id.startsWith(prefix))) exempt = true;
            el = el.parentElement;
          }
          if (!exempt) out.push(text.slice(0, 80));
        }
        return out;
      });
      offenders.push(...found.map((t) => `[${where}] ${t}`));
    };

    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      await sweep(tab);
    }
    await gotoTab(page, "tasks");
    await page.getByTestId("task-open-t1").click();
    await page.getByTestId("task-detail").waitFor({ state: "visible" });
    await sweep("task-detail");
    await page.getByTestId("task-detail-close").click();

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});

/**
 * GL-05's other half — the components GL-05 exempts from its 36px floor are
 * measured against the PACK'S OWN SIZE instead (02_ACCEPTANCE_TESTS_v2.md §4,
 * A-46). Without this the exemption is pure subtraction, which is exactly what
 * the auditor said when it rejected the first version of the remedy
 * (AUDIT_v2.md AAA-03): `primitives.test.tsx` asserts a `hitSlop` PROP and
 * `tokens.test.ts` asserts a CONSTANT — neither measures a rendered box.
 *
 * This measures rendered boxes, in the browser, at phone width. It is what
 * makes "36, or the pack's own size" a stricter check than a floor rather than
 * a hole — and it is what would have caught AAA-01, where `Checkbox` inflated
 * from the pack's 15 to 24 with a zero content box and a done task drew as a
 * blank square.
 */
test.describe("GL-05 pack-fixed component sizes", () => {
  test("each component the floor exempts renders at the size the pack fixes", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 768, "measured at phone width, where GL-05 applies");
    await openUnlocked(page);

    const box = async (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { w: Math.round(r.width), h: Math.round(r.height), padTop: cs.paddingTop, marginLeft: cs.marginLeft };
      });

    // README Components: "Checkbox: 15px, radius 5". A padded 24 with a zero
    // content box is not 15, and its negative margin dragged it out of the card.
    const cb = await box('[data-checkbox="1"]');
    expect(cb.w).toBe(15);
    expect(cb.h).toBe(15);
    expect(cb.marginLeft).toBe("0px");

    // "Icon button `.js-iconbtn`: 32 or 36 square"
    const icon = await box('[data-iconbtn="1"]');
    expect([32, 36]).toContain(icon.w);
    expect(icon.w).toBe(icon.h);

    // "switches 26 × 15" in the pack, 40 × 24 in mock v11 — DISCREPANCIES row 8
    // rules the mock wins, so this asserts the mock's, which is what ships.
    await page.getByTestId("header").getByLabel("Settings").click();
    await page.getByTestId("settings-sheet").waitFor({ state: "visible" });
    const sw = await box('[data-switch="1"]');
    expect(sw.w).toBe(40);
    expect(sw.h).toBe(24);
    await page.getByTestId("settings-close").click();

    // "Habit chip: min-height 34" (32 compact on Today — DISCREPANCIES row 3)
    const habit = await box('[data-habit="1"]');
    expect(habit.h).toBeGreaterThanOrEqual(32);
    expect(habit.marginLeft).toBe("0px"); // a negative margin overlapped the 6px gap

    // AUDIT_v2.md B5-04: the other four exempt classes were exempt and
    // unasserted, which is the hole A-46's remedy was supposed to close.
    // "Small `.js-btn-sm`: 6 × 10, 11.5/500 (row verbs…)" — the pack's own
    // 28px verb, and README Accessibility's carve-out for it.
    const verb = await box('[data-btn-sm="1"]');
    expect(verb.h).toBeGreaterThanOrEqual(28);
    expect(verb.marginLeft).toBe("0px");

    // "Focus chip: 6 × 12, radius 8" — 30 tall in the mock
    const chip = await box('[data-chip="1"]');
    expect(chip.h).toBeGreaterThanOrEqual(28);
    expect(chip.marginLeft).toBe("0px");

    // handoff.md: "mic … and arrow_upward … 30px buttons", "a 30px `tune` button"
    const fieldIo = await box('[data-field-io="1"]');
    expect(fieldIo.w).toBe(30);
    expect(fieldIo.h).toBe(30);

    // the segmented control's own segment: 36 on the phone (GL-05's floor),
    // the mock's 30 on pointer devices
    const seg = await box('[role="tab"]');
    expect(seg.h).toBe(36);
  });
});

/**
 * QB-04 — every interactive control announces a name. Kept inside GL-05's row
 * ("accessibility label on every control, asserted by the same sweep"), and
 * until AUDIT_v2.md B4-04 there was no such sweep: names were added by hand to
 * whichever controls someone had looked at, and three dialog inputs had none.
 */
test.describe("QB-04 every control has an accessible name", () => {
  test("no interactive element on any tab or overlay is unnamed", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 768, "one width is enough — the names are not responsive");
    await openUnlocked(page);
    const all: { kind: string; detail: string }[] = [];
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      all.push(...(await unnamedControlViolations(page)).map((v) => ({ ...v, detail: `[${tab}] ${v.detail}` })));
    }

    await gotoTab(page, "brain");
    for (const [name, open] of [["item-editor", async () => void (await page.getByTestId("edit-item-b1").click())]] as [string, () => Promise<void>][]) {
      await open();
      await page.waitForTimeout(250);
      all.push(...(await unnamedControlViolations(page)).map((v) => ({ ...v, detail: `[${name}] ${v.detail}` })));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    // ST-1: `rule-edit` on Brain is gone with Brain's Rules section. Its
    // replacement is the EA's rules editor under Settings, and the sweep
    // follows it there rather than losing an overlay — an overlay that stops
    // being walked is an overlay whose controls quietly stop being named,
    // which is the hole AUDIT_v2.md AA-03 found in this very test.
    await clickSettingsEntry(page);
    await page.getByTestId("settings-rules-edit").click();
    await page.getByTestId("rule-edit-dialog").waitFor({ state: "visible", timeout: 10000 });
    all.push(...(await unnamedControlViolations(page)).map((v) => ({ ...v, detail: `[rules-edit] ${v.detail}` })));
    // and its FORM, which carries the fields and is a second surface
    await page.getByTestId("rule-add-open").click();
    await page.getByTestId("rule-form").waitFor({ state: "visible", timeout: 10000 });
    all.push(...(await unnamedControlViolations(page)).map((v) => ({ ...v, detail: `[rule-form] ${v.detail}` })));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    expect(all, JSON.stringify(all, null, 2)).toEqual([]);
  });
});

/**
 * WCAG 2.5.3 Label in Name — what a control ANNOUNCES contains what it SHOWS.
 *
 * QB-04 above proves every control has a name; it cannot see a name that
 * disagrees with the label beside it. The planner read the 20:26 mock at 393
 * (12 Sep) and found the pair on the lock screen: the button says "Unlock with
 * passkey" and the control announced "Unlock with Face ID" — a speech-input
 * user saying what they can see reaches nothing, and the name claims a
 * mechanism the web build does not use (`webauthnGate.ts`, not
 * expo-local-authentication). The locked gate is swept BEFORE the unlock,
 * because it is the one surface no unlocked sweep can reach.
 */
test.describe("label in name — a control's accessible name contains its visible label", () => {
  test("the locked gate and every tab", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 768, "one width is enough — the names are not responsive");
    const all: { kind: string; detail: string }[] = [];
    await openApp(page);
    all.push(...(await labelInNameViolations(page)).map((v) => ({ ...v, detail: `[locked] ${v.detail}` })));
    await unlock(page);
    await expect(page.getByTestId("tab-today")).toBeVisible({ timeout: 15000 });
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      all.push(...(await labelInNameViolations(page)).map((v) => ({ ...v, detail: `[${tab}] ${v.detail}` })));
    }
    expect(all, JSON.stringify(all, null, 2)).toEqual([]);
  });
});

/**
 * LH-08 — a habit cell is read by its FILL and by the NUMBER inside it, so both
 * are measured.
 *
 * The first cut of this guard checked only the hit fill against the ground and
 * cleared 3:1 by 0.13, while the day number inside a hit cell sat at 3.83:1 and
 * the number in a missed one at 2.64:1 — both under every floor the pack states
 * for itself, and both the thing Josh will actually read, because his whole
 * reference is cells that carry their day number (ux round 1, LH1-03). A guard
 * that passes the wrong measurement is worse than none: it says the question
 * was asked.
 *
 * Measured on the RENDERED cells in both schemes rather than on the token
 * values, because a token is a promise about a colour and a composite is what
 * lands on the screen (hard rule 20, R-26).
 */
test.describe("LH-08 habit grids: a hit is visibly a hit, and its number is legible", () => {
  test("fills and numbers both clear their floors in this scheme", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "life");
    await page.getByTestId("habits-trends").click();
    await page.getByTestId("trends-period").getByRole("tab", { name: "Month" }).click();
    await expect(page.getByTestId("habit-month-caption")).toBeVisible();

    const measured = await page.evaluate(() => {
      const parse = (c: string): [number, number, number, number] => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (!m) return [0, 0, 0, 0];
        const p = m[1].split(",").map((x) => parseFloat(x.trim()));
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      };
      const over = (fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] => [
        Math.round(fg[0] * fg[3] + bg[0] * (1 - fg[3])),
        Math.round(fg[1] * fg[3] + bg[1] * (1 - fg[3])),
        Math.round(fg[2] * fg[3] + bg[2] * (1 - fg[3])),
      ];
      /** the colour actually painted where this element sits */
      const painted = (el: Element): [number, number, number] => {
        const chain: string[] = [];
        let node: Element | null = el;
        while (node) {
          chain.push(getComputedStyle(node).backgroundColor);
          node = node.parentElement;
        }
        let bg: [number, number, number] = [255, 255, 255];
        for (let i = chain.length - 1; i >= 0; i--) {
          const c = parse(chain[i]);
          if (c[3] > 0) bg = over(c, bg);
        }
        return bg;
      };
      /** a cell's own ink, composited onto whatever it is painted over */
      const ink = (el: Element): [number, number, number] => {
        const text = el.querySelector("div") ?? el;
        const cs = getComputedStyle(text);
        const opacity = parseFloat(cs.opacity || "1");
        const c = parse(cs.color);
        return over([c[0], c[1], c[2], c[3] * opacity], painted(el));
      };

      // only cells of the CURRENT month carry a day key in their testid
      const cells = Array.from(document.querySelectorAll('[data-testid^="habit-month-h"][data-testid*="-20"]'));
      const alpha = (el: Element) => parse(getComputedStyle(el).backgroundColor)[3];
      const hit = cells.find((el) => alpha(el) > 0.5);
      const miss = cells.find((el) => alpha(el) > 0 && alpha(el) <= 0.5);
      if (!hit || !miss) return null;
      return {
        hitFill: painted(hit),
        missFill: painted(miss),
        hitInk: ink(hit),
        missInk: ink(miss),
      };
    });

    // ALL THREE must exist, or the test proved nothing: a grid of only hits or
    // only misses would pass a ratio check on a cell it never found (rule 14)
    expect(measured, "the month grid must show both a hit and a miss").not.toBeNull();
    const m = measured!;

    const round = (n: number) => Math.round(n * 100) / 100;
    const results = {
      // the two cells against each other — Josh's "hits and misses clearly"
      hitVsMiss: round(contrastRatio(m.hitFill, m.missFill)),
      // and each number against the cell it sits in, which is what the first
      // cut of this guard never looked at
      hitNumber: round(contrastRatio(m.hitInk, m.hitFill)),
      missNumber: round(contrastRatio(m.missInk, m.missFill)),
    };
    expect({
      ...results,
      hitVsMissPasses: results.hitVsMiss >= 3,
      hitNumberPasses: results.hitNumber >= 4.5,
      missNumberPasses: results.missNumber >= 4.5,
    }).toEqual({ ...results, hitVsMissPasses: true, hitNumberPasses: true, missNumberPasses: true });
  });
});

/**
 * SY-03 — the sync dot's three colours, measured against the bar they are
 * painted on, in both schemes.
 *
 * `warn` is a token this build ADDED (design/DISCREPANCIES.md #30): the pack
 * has no amber, so nothing else in the app has ever measured it, and a new
 * signal colour with no gate behind it is a colour somebody chose by eye. The
 * three states are walked for real rather than set — there is no way to write
 * a status into the store from a test, and a dot that renders one colour and
 * never changes would pass a check that only ever saw its first state.
 *
 * The fills are also asserted DIFFERENT from each other. Three colours that
 * all clear 3:1 and are indistinguishable would satisfy a ratio check and say
 * nothing to the person reading the dot.
 */
// LV-07 lives HERE rather than in `tests/native/screens.test.tsx`, which is where
// the acceptance row's "Where" column points, and T2-1's self-check records the
// move rather than quietly meeting a different bar. The lesson is "reads its token
// off the RENDERED element"; a native-renderer test sees the PROP and never the
// painted pixel (B-10, the same finding that made `accessibilityState` an e2e
// assertion). SY-03 below, MC-02 for the mic and LH-08 for the habit grids all
// measure the colour actually painted, on the ground actually behind it.
test.describe("SY-03 the sync dot's three colours clear the bar behind them", () => {
  test("ok, pending and attention each measure ≥ 3:1 in this scheme, and differ from each other", async ({ page }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
    const rig = {
      goOffline: () => page.evaluate(() => (window as any).__JSTACK__.goOffline()),
      goOnline: () => page.evaluate(() => (window as any).__JSTACK__.goOnline()),
      outbox: () => page.evaluate(() => (window as any).__JSTACK__.outbox()) as Promise<{ offlineId: string }[]>,
      forceConflict: (id: string) => page.evaluate((offlineId) => (window as any).__JSTACK__.forceConflict(offlineId), id),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await openUnlocked(page);
    const dot = page.getByTestId("sync-dot");

    /** the mark's own fill, and the colour actually painted behind it */
    const measure = () =>
      dot.evaluate((el) => {
        const parse = (c: string): [number, number, number, number] => {
          const m = /rgba?\(([^)]+)\)/.exec(c);
          if (!m) return [0, 0, 0, 0];
          const p = m[1].split(",").map((x) => parseFloat(x.trim()));
          return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
        };
        const over = (fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] => [
          Math.round(fg[0] * fg[3] + bg[0] * (1 - fg[3])),
          Math.round(fg[1] * fg[3] + bg[1] * (1 - fg[3])),
          Math.round(fg[2] * fg[3] + bg[2] * (1 - fg[3])),
        ];
        const painted = (node: Element | null): [number, number, number] => {
          const chain: string[] = [];
          while (node) {
            chain.push(getComputedStyle(node).backgroundColor);
            node = node.parentElement;
          }
          let bg: [number, number, number] = [255, 255, 255];
          for (let i = chain.length - 1; i >= 0; i--) {
            const c = parse(chain[i]);
            if (c[3] > 0) bg = over(c, bg);
          }
          return bg;
        };
        const mark = el.querySelector("div") as HTMLElement;
        const own = parse(getComputedStyle(mark).backgroundColor);
        const bar = painted(mark.parentElement);
        return { fill: over(own, bar), bar, label: el.getAttribute("aria-label") };
      });

    const settled = await measure();
    expect(settled.label).toBe("Sync · ok");

    await gotoTab(page, "brain");
    await rig.goOffline();
    await page.getByTestId("dump-input").fill("something to hold on to");
    await page.getByTestId("dump-send").click();
    await expect(dot).toHaveAttribute("aria-label", "Sync · 1 capture waiting");
    const pending = await measure();

    const [entry] = await rig.outbox();
    await rig.forceConflict(entry.offlineId);
    await rig.goOnline();
    await expect(dot).toHaveAttribute("aria-label", "Sync · needs attention");
    const attention = await measure();

    const round = (n: number) => Math.round(n * 100) / 100;
    const ratios = {
      ok: round(contrastRatio(settled.fill, settled.bar)),
      pending: round(contrastRatio(pending.fill, pending.bar)),
      attention: round(contrastRatio(attention.fill, attention.bar)),
    };
    expect({
      ...ratios,
      okPasses: ratios.ok >= 3,
      pendingPasses: ratios.pending >= 3,
      attentionPasses: ratios.attention >= 3,
      allThreeDiffer: new Set([settled.fill.join(), pending.fill.join(), attention.fill.join()]).size === 3,
    }).toEqual({ ...ratios, okPasses: true, pendingPasses: true, attentionPasses: true, allThreeDiffer: true });
  });
});

/**
 * RL-11 — the two sweeps `e2e/lib/sweeps.ts` carried since V2 and no spec
 * ever ran (F-87, Stage 5d P-9): the body never scrolls sideways, and no two
 * controls overlap unless one contains the other. Per tab, scoped to the
 * tab's own screen. Seen to fail: the Calendar card's three hint links
 * overlapped by 15 px on Today at every width — B-49's class, two `Txt
 * onPress` boxes closer than their slop.
 */
test.describe("RL-11 nothing scrolls sideways and no two controls overlap", () => {
  test("on every tab", async ({ page }) => {
    await openUnlocked(page);
    const all: string[] = [];
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      all.push(...(await horizontalScrollViolations(page)).map((v) => `[${tab}] ${v.detail}`));
      all.push(...(await overlapViolations(page, `[data-testid="tab-screen-${tab}"]`)).map((v) => `[${tab}] ${v.detail}`));
    }
    expect(all).toEqual([]);
  });
});

/**
 * K1-03 (P-9) — at 1024 the demo watermark met the Find modal's bottom-left
 * corner. A centred modal now sends the mark to the foot at every width, as
 * the phone's overlays already did; on a phone Find is a full screen that
 * keeps the mark's clearance at its own foot, so the claim is desktop's.
 */
test.describe("ID-02 the demo watermark clears an open modal", () => {
  test("with Find open, the mark's box and the modal's are disjoint", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width < 768, "a phone's Find is a full screen with the mark at its foot by design");
    await openUnlocked(page);
    await page.getByTestId("rail-find").click();
    await expect(page.getByTestId("find")).toBeVisible();
    const boxes = await page.evaluate(() => {
      const rect = (s: string) => document.querySelector(s)?.getBoundingClientRect();
      const m = rect('[data-testid="find"]');
      const w = rect('[data-testid="demo-watermark"]');
      if (!m || !w) return null;
      return { overlap: m.left < w.right && w.left < m.right && m.top < w.bottom && w.top < m.bottom, modalBottom: Math.round(m.bottom), markTop: Math.round(w.top) };
    });
    expect(boxes).not.toBeNull();
    expect(boxes!.overlap).toBe(false);
  });
});
