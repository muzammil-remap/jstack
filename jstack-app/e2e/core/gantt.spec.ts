/**
 * GT-01..GT-08 — the Gantt is a timeline you can edit (G-1, ADR-46).
 *
 * ADR-12 made it read-only in V2 on the grounds that Twenty owned the dates.
 * ADR-46 reverses that: the dates are the app's to move and Twenty's to mirror,
 * so a bar drags, its ends resize, and an undated task can be dropped onto a
 * day. What did not change is the safety property the board already pays for —
 * a tap must never move a task — so GT-06 is here as well as in
 * `tests/unit/drag.test.ts`.
 *
 * WHICH POINTER: the desktop cases drive `page.mouse` because the responder
 * maps pointer events, and GT-08 drives CDP `Input.dispatchTouchEvent` because
 * a long press is a touch gesture and Playwright's `touchscreen.tap` cannot
 * hold. Resolution #59 fixes that split; the header of each case says which it
 * is using and why.
 *
 * The hold applies on TOUCH ONLY (`isTouchClass()`), which is why the mouse
 * cases below do not wait 600ms: on a desktop a press-and-move on a bar can
 * only mean one thing, so charging a delay for it would be a delay for nothing.
 */
import { assertCleanConsole, db, expect, expectUndoToast, gotoTab, openUnlocked, test, undo } from "../helpers";

async function openGantt(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "tasks");
  await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
  await expect(page.getByTestId("task-views").getByTestId("gantt")).toBeVisible();
  return log;
}

/** the full Gantt — Waiting on's mini card renders bars for the same tasks */
const full = (page: import("@playwright/test").Page) => page.getByTestId("task-views").getByTestId("gantt");

async function box(page: import("@playwright/test").Page, testId: string) {
  const b = await full(page).getByTestId(testId).boundingBox();
  if (b == null) throw new Error(`${testId} has no box`);
  return b;
}

/** a task's dates, straight from the mock's own state */
async function dates(page: import("@playwright/test").Page, id: string) {
  const state = await db(page);
  const t = state.tasks.find((x: { id: string }) => x.id === id);
  return { startsAt: t?.startsAt as string | undefined, endsAt: t?.endsAt as string | undefined };
}

test.describe("GT-01 the axis is a scale, not two captions", () => {
  test("day ticks, Monday week bands, month labels, weekend shading and a today line", async ({ page }) => {
    const log = await openGantt(page);
    const axis = full(page).getByTestId("gantt-axis");
    await expect(axis).toBeVisible();

    // a scale has a tick per day: more than a fortnight of them on the default
    // 90-day range, which two captions could never produce
    const ticks = await full(page).locator("[data-testid^='gantt-day-']").count();
    expect(ticks).toBeGreaterThan(14);

    // week bands start on Mondays. The band's testID carries its own Monday,
    // so this reads the DAY OF WEEK off the id rather than trusting a label.
    const weekIds = await full(page).locator("[data-testid^='gantt-week-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("gantt-week-", "")));
    expect(weekIds.length).toBeGreaterThan(1);
    for (const key of weekIds) {
      expect(new Date(`${key}T12:00:00`).getDay()).toBe(1); // 1 = Monday
    }

    await expect(full(page).locator("[data-testid^='gantt-month-']").first()).toBeVisible();
    // weekends are shaded, and there are two of them in any fortnight
    expect(await full(page).locator("[data-testid^='gantt-weekend-']").count()).toBeGreaterThanOrEqual(2);
    assertCleanConsole(log);
  });

  test("the today line sits at today's true position, inside today's own column", async ({ page }) => {
    await openGantt(page);
    const line = await box(page, "gantt-today");
    const scroll = await box(page, "gantt-scroll");

    /**
     * The default range starts TODAY (`next`), so the line belongs in the
     * FIRST column — but not at its left edge, and that distinction is what
     * this test got wrong until V-1's board caught it.
     *
     * The line is drawn at `(now - from) / (to - from)`, and `from` is
     * MIDNIGHT. So it walks right across today's column as the day goes on,
     * reaching a full column width just before midnight. The old assertion
     * allowed 1% of the axis width from the chart's left edge; over a 90-day
     * range one day IS about 1.1% of the axis, so the tolerance was smaller
     * than the legitimate offset and the case could only pass before about
     * half past nine at night. It passed on E-1's board at 21:00 and failed on
     * V-1's at 22:20, at both widths, having never been wrong about the app.
     *
     * The real claim is "inside today's column", so that is what is asserted,
     * against a column width MEASURED from two adjacent ticks rather than
     * recomputed from the formula under test (hard rule 11).
     */
    const dayWidth = await full(page)
      .locator("[data-testid^='gantt-day-']")
      .evaluateAll((els) => {
        const xs = els.slice(0, 2).map((e) => e.getBoundingClientRect().x);
        return xs.length === 2 ? xs[1] - xs[0] : 0;
      });
    expect(dayWidth).toBeGreaterThan(0);

    const offset = line.x - scroll.x;
    expect(offset).toBeGreaterThanOrEqual(-1);
    // inside the first column, wherever in the day the clock happens to be
    expect(offset).toBeLessThanOrEqual(dayWidth + 1);
  });
});

test.describe("GT-02 the range decides the width, and Fit decides the range", () => {
  test("a 90-day range is wider than the viewport and scrolls", async ({ page }) => {
    await openGantt(page);
    const scroller = full(page).getByTestId("gantt-scroll");
    const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test("Fit snaps the range to what is scheduled, and the chip says so", async ({ page }) => {
    await openGantt(page);
    const before = await full(page).getByTestId("gantt-scroll").evaluate((el) => el.scrollWidth);
    await full(page).getByTestId("gantt-fit").click();
    // the fitted window is the span of the bars, which is narrower than 90 days
    await expect.poll(async () => full(page).getByTestId("gantt-scroll").evaluate((el) => el.scrollWidth)).toBeLessThan(before);
    // and the range chip follows, because Fit sets the shared range rather than
    // a private zoom the other three views know nothing about
    await expect(page.getByTestId("task-range")).not.toHaveText("Next 90 days");
  });
});

test.describe("GT-03 swimlanes", () => {
  test("bars are grouped by project with a lane label", async ({ page }) => {
    await openGantt(page);
    await expect(full(page).getByTestId("gantt-lane-jstack")).toBeVisible();
    await expect(full(page).getByTestId("gantt-bar-t1")).toBeVisible();
  });
});

test.describe("GT-04/GT-05 moving and resizing (1366, mouse)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1180, "the mouse cases are the desktop's; GT-08 covers touch");

  test("dragging a bar moves BOTH dates by the days it travelled, with an undo", async ({ page }) => {
    const log = await openGantt(page);
    const before = await dates(page, "t1");
    const b = await box(page, "gantt-bar-t1");
    const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

    // three moves, as the board's drag is driven: it proves the threshold is
    // measured from the press rather than from the last frame
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y);
    await page.mouse.move(from.x + 40, from.y);
    await page.mouse.move(from.x + 56, from.y); // 2 days at 28px
    await page.mouse.up();

    await expectUndoToast(page);
    const after = await dates(page, "t1");
    expect(dayOf(after.startsAt)).toBe(addDays(dayOf(before.startsAt), 2));
    expect(dayOf(after.endsAt)).toBe(addDays(dayOf(before.endsAt), 2));

    await undo(page);
    await expect.poll(async () => dayOf((await dates(page, "t1")).startsAt)).toBe(dayOf(before.startsAt));
    assertCleanConsole(log);
  });

  test("dragging the end handle moves only the end", async ({ page }) => {
    await openGantt(page);
    // t7 starts TODAY and runs four days, so its bar is not clipped by the
    // window's left edge and is wide enough to have a middle as well as two
    // ends. t1 starts two days before the range opens, so only one day of it
    // is drawn — and a one-day bar is all grab and no handles, by design.
    const before = await dates(page, "t7");
    const h = await box(page, "gantt-handle-end-t7");

    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 20, h.y + h.height / 2);
    await page.mouse.move(h.x + h.width / 2 + 28, h.y + h.height / 2); // 1 day
    await page.mouse.up();

    // WPR-5: POLL for the moved edge rather than reading it once. `dates` reads the MOCK's state, and the drag's
    // commit is a round trip — the store writes through the adapter and the mock answers — so a single read straight
    // after the pointer lifted is a race, and the board lost it three times in ten. It is the read that was late, not
    // the drag: probing the responder showed the grant landing at the press position, `d=1` on both moves, and
    // `onDrop moved=1 edge=end` in every one of those failures, with no card opened. The bar drag above waits on its
    // undo toast before reading, which is why it never flaked. Both facts are still asserted, and the gesture is
    // unchanged: the end moved one day, and the start did not move at all.
    await expect.poll(async () => dayOf((await dates(page, "t7")).endsAt)).toBe(addDays(dayOf(before.endsAt), 1));
    const after = await dates(page, "t7");
    expect(after.startsAt).toBe(before.startsAt); // the start did not move
  });

  test("dragging the start handle moves only the start", async ({ page }) => {
    await openGantt(page);
    const before = await dates(page, "t7");
    const h = await box(page, "gantt-handle-start-t7");

    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 20, h.y + h.height / 2);
    await page.mouse.move(h.x + h.width / 2 + 28, h.y + h.height / 2); // 1 day later
    await page.mouse.up();

    // WPR-5: polled for the reason above — the end handle's mirror, and the same race.
    await expect.poll(async () => dayOf((await dates(page, "t7")).startsAt)).toBe(addDays(dayOf(before.startsAt), 1));
    const after = await dates(page, "t7");
    expect(after.endsAt).toBe(before.endsAt); // the end did not move
  });
});

test.describe("GT-06 a tap is not a drag", () => {
  test("a press with no travel opens the task card", async ({ page }) => {
    await openGantt(page);
    const b = await box(page, "gantt-bar-t1");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("task-detail")).toBeVisible();
  });
});

test.describe("GT-07 the Unscheduled lane", () => {
  /** the lane and its rows exist at every width — the half of GT-07 that is
   *  about WHERE an undated task lives rather than how it leaves. */
  test("a task with no dates sits in the lane", async ({ page }) => {
    await openGantt(page);
    const lane = full(page).getByTestId("gantt-unscheduled");
    await expect(lane).toBeVisible();
    const row = lane.locator("[data-testid^='gantt-unscheduled-']").first();
    const id = (await row.getAttribute("data-testid"))!.replace("gantt-unscheduled-", "");
    expect((await dates(page, id)).startsAt).toBeUndefined();
  });

  /**
   * The drop, driven by the pointer the width actually has.
   *
   * Lifting a row out of this lane means dragging it UP onto the chart, and
   * after the round-2 layout that is about 250px of vertical travel at 393 —
   * which the page's own scroller reads as a scroll and terminates. The lane
   * now takes the same long-press gate the bars do, so on touch the finger
   * waits first and on a desktop nothing is charged for a gesture that was
   * never ambiguous. The two cases below are the same claim through the two
   * pointers, which is why neither is skipped without the other covering it.
   */
  async function assertScheduled(page: import("@playwright/test").Page, id: string) {
    await expect.poll(async () => (await dates(page, id)).startsAt).not.toBeUndefined();
    const after = await dates(page, id);
    // 9:00 to 17:00 on the day it was dropped on — the same hours the card's
    // date field defaults to, so a dragged task and a typed one agree. Read in
    // the BROWSER, whose zone the config pins: Node's `getHours()` is the
    // machine's zone, and on the UTC nightly runner 9:00 Brisbane read 23 (v2.21).
    const [start, end] = await page.evaluate(({ s, e }) => [new Date(s).getHours(), new Date(e).getHours()], { s: after.startsAt!, e: after.endsAt! });
    expect(start).toBe(9);
    expect(end).toBe(17);
  }

  test("dropping it on the chart schedules it 9 to 5 (mouse)", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 1180, "the touch case below covers the phone");
    await openGantt(page);
    const row = full(page).locator("[data-testid^='gantt-unscheduled-']").first();
    const id = (await row.getAttribute("data-testid"))!.replace("gantt-unscheduled-", "");
    const rb = (await row.boundingBox())!;
    const chart = await box(page, "gantt-scroll");

    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await page.mouse.move(chart.x + 40, chart.y + chart.height / 2);
    await page.mouse.move(chart.x + 60, chart.y + chart.height / 2);
    await page.mouse.move(chart.x + 70, chart.y + chart.height / 2);
    await page.mouse.up();

    await assertScheduled(page, id);
  });

  test("dropping it on the chart schedules it 9 to 5 (touch, after a hold)", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 1180, "the mouse case above covers the desktop");
    await openGantt(page);
    const row = full(page).locator("[data-testid^='gantt-unscheduled-']").first();
    const id = (await row.getAttribute("data-testid"))!.replace("gantt-unscheduled-", "");

    // scroll the lane clear of the tab bar before touching it. At 393 the lane
    // is the last thing on a tall page, and the fixed bottom chrome sits over
    // it until the page is scrolled — `pagePadPhone.bottom` is 120 precisely so
    // it CAN be scrolled clear. Measured, not assumed: without this the touch
    // landed on `tabbar` and the row never saw an event at all.
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(200);

    const rb = (await row.boundingBox())!;
    const chart = await box(page, "gantt-scroll");
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });

    const ty = chart.y + chart.height / 2;
    await touch("touchStart", rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.waitForTimeout(700); // past the hold, so the lane keeps the gesture
    await touch("touchMove", chart.x + 50, ty);
    await touch("touchMove", chart.x + 60, ty);
    await touch("touchMove", chart.x + 70, ty);
    await touch("touchEnd", chart.x + 70, ty);

    await assertScheduled(page, id);
  });
});

test.describe("GT-08 the long press (393, touch)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1180, "the hold is the touch class's; the desktop drags without one");

  /**
   * One claim per test, and deliberately not two gestures in one.
   *
   * They were one case to begin with — swipe, assert nothing moved, then hold
   * and drag — and the second gesture did nothing, because the scroller was
   * still holding the one before it. Re-measuring the bar was not enough. Two
   * contexts cost a few seconds and remove a source of flake that would only
   * ever have been diagnosed again from scratch.
   */
  /** one finger, kept as one finger: the same `id` across the sequence, or
   * Chrome treats each move as a new touch and the responder sees no drag. */
  const toucher = (cdp: Awaited<ReturnType<import("@playwright/test").BrowserContext["newCDPSession"]>>, y: number) => (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });

  test("a held press picks a bar up and moves both its dates", async ({ page }) => {
    await openGantt(page);
    const before = await dates(page, "t7");
    const b = await box(page, "gantt-bar-t7");
    const cx = b.x + b.width / 2;
    const touch = toucher(await page.context().newCDPSession(page), b.y + b.height / 2);

    await touch("touchStart", cx);
    await page.waitForTimeout(700); // past HOLD_MS
    await touch("touchMove", cx + 20);
    await touch("touchMove", cx + 40);
    await touch("touchMove", cx + 56); // 2 days at 28px
    await touch("touchEnd", cx + 56);

    await expect.poll(async () => dayOf((await dates(page, "t7")).startsAt)).toBe(addDays(dayOf(before.startsAt), 2));
    expect(dayOf((await dates(page, "t7")).endsAt)).toBe(addDays(dayOf(before.endsAt), 2));
  });

  test("a quick swipe scrolls the timeline instead, and moves nothing", async ({ page }) => {
    await openGantt(page);
    const before = await dates(page, "t7");
    const b = await box(page, "gantt-bar-t7");
    const cx = b.x + b.width / 2;
    const touch = toucher(await page.context().newCDPSession(page), b.y + b.height / 2);

    // no wait: the finger moves while the hold is still running, so the axis
    // takes the gesture
    await touch("touchStart", cx);
    await touch("touchMove", cx - 40);
    await touch("touchMove", cx - 80);
    await touch("touchEnd", cx - 80);

    expect(await dates(page, "t7")).toEqual(before);
    // and it is not a tap either — a swipe that opened the card would make the
    // timeline unusable on a phone
    await expect(page.getByTestId("task-detail")).toHaveCount(0);
  });
});

/** the LOCAL day of an instant. `slice(0, 10)` would be the UTC day, which is
 * the previous evening anywhere behind UTC (B-18) — and Playwright pins
 * Brisbane, which is ten hours ahead of it. */
function dayOf(at: string | undefined): string {
  if (at == null) return "";
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Stage 6 A-3 — what the device pass measured on the timeline (ux round
 * S6-04, S6-29).
 */
test.describe("S6-04 the first caption names the day at its own pixel, and the now-rule keeps clear of the caption row", () => {
  test("the leftmost week caption is the window's first day, not an off-plot Monday, and the today line starts under the captions", async ({ page }) => {
    await openGantt(page);
    // the window's first day is the first day tick's own key — read off the
    // scale rather than recomputed from a clock this test does not own
    const firstDay = (await full(page).locator("[data-testid^='gantt-day-']").first().getAttribute("data-testid"))!.replace("gantt-day-", "");
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const expected = `${Number(firstDay.slice(8, 10))} ${MONTHS[Number(firstDay.slice(5, 7)) - 1]}`;
    // the pass measured `7 Sep` standing on the 10th's column — the caption
    // for a band whose Monday is off the plot is the date at x 0
    await expect(full(page).locator("[data-testid^='gantt-week-']").first()).toHaveText(expected);

    // the now-rule crossed the caption's glyphs; it starts below the row now
    const line = await box(page, "gantt-today");
    const captions = await full(page).locator("[data-testid^='gantt-week-']").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    expect(captions.length).toBeGreaterThan(0);
    expect(line.y).toBeGreaterThanOrEqual(Math.max(...captions));
  });
});

test.describe("S6-29 the Unscheduled lane is one box of hairline rows, each saying what the task is, and none of them finished", () => {
  test("no finished task waits for a date; every row carries the list row's meta; the rows share one dashed box", async ({ page }) => {
    // the list row's meta for t4, read on the List view first
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    const listMeta = (await page.getByTestId("task-open-t4").innerText()).split("\n").slice(1).join(" ").trim();
    expect(listMeta).not.toBe("");

    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    const lane = full(page).getByTestId("gantt-unscheduled");
    await expect(lane).toBeVisible();

    // t9 and t10 are the two rows the Done tab shows struck through; the pass
    // found both listed here as work waiting for a date
    const ids = await lane.locator("[data-testid^='gantt-unscheduled-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("gantt-unscheduled-", "")));
    expect(ids.length).toBeGreaterThan(0);
    const state = await db(page);
    const finished = ids.filter((id) => state.tasks.find((t: { id: string }) => t.id === id)?.status === "done");
    expect(finished).toEqual([]);

    // the row says what the task is, in the same words as the list
    await expect(lane.getByTestId("gantt-unscheduled-t4")).toContainText(listMeta);

    // one container, hairline separators: a row draws no top border of its
    // own (the pass measured two dashed rules 3px apart between every pair),
    // and the separator under a row that is not the last is a solid hairline
    const first = lane.locator("[data-testid^='gantt-unscheduled-']").first();
    const style = await first.evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: s.borderTopWidth, bottomStyle: s.borderBottomStyle, bottomWidth: s.borderBottomWidth };
    });
    expect(style).toEqual({ top: "0px", bottomStyle: "solid", bottomWidth: "1px" });
    const container = await first.evaluate((el) => getComputedStyle(el.parentElement!).borderStyle);
    expect(container).toBe("dashed");
  });
});
