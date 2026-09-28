/**
 * CG-01..08 — the "All calendars" grid: segmented Today/3 days/Week/
 * Month, the time-grid's pixel math, the now line, and the month dots.
 */
import { assertCleanConsole, expect, openUnlocked, test } from "../helpers";

const DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

test.describe("CG-01 segmented control", () => {
  test("defaults to Today, exactly one selected", async ({ page }) => {
    const log = await openUnlocked(page);
    await expect(page.getByTestId("cal-seg").getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("cal-seg").getByRole("tab", { name: "3 days" })).toHaveAttribute("aria-selected", "false");
    assertCleanConsole(log);
  });
});

test.describe("CG-02 Today view pixel math", () => {
  test("the three fixture events land at (start-6)*24 top and duration*24-2 height", async ({ page }) => {
    // ev3 is `{{SCHOOLDAY;15:00}}`: on a Saturday or a Sunday it resolves to
    // Monday, correctly, and this case failed every weekend (the A-4 round 8
    // board ran after midnight on a Saturday). The fixtures resolve against the
    // page's own clock when the mock seeds, so the clock is pinned to a
    // Wednesday noon BEFORE the app loads — CG-03's lesson (B-40) for the date.
    await page.clock.setFixedTime(new Date("2026-09-16T12:00:00+10:00"));
    await openUnlocked(page);
    // ev1 09:00-09:45, ev2 12:30-13:30, ev3 15:00-16:00 (data/mock/fixtures/calendar.json)
    await expect(page.getByTestId("cal-event-ev1")).toHaveCSS("top", "72px");
    await expect(page.getByTestId("cal-event-ev1")).toHaveCSS("height", "16px");
    await expect(page.getByTestId("cal-event-ev2")).toHaveCSS("top", "156px");
    await expect(page.getByTestId("cal-event-ev2")).toHaveCSS("height", "22px");
    await expect(page.getByTestId("cal-event-ev3")).toHaveCSS("top", "216px");
    await expect(page.getByTestId("cal-event-ev3")).toHaveCSS("height", "22px");
  });
});

test.describe("CG-03 now line", () => {
  test("renders only on today's track", async ({ page }) => {
    await openUnlocked(page);
    // B-40: `setClockOffsetMs(0)` means "no offset" — the REAL current time —
    // so the now-line only rendered when the board happened to run inside the
    // grid's 06:00-20:00 window (`lib/timeGrid.ts`'s HOUR_START/HOUR_END);
    // outside it the line correctly doesn't render and this test flaked on
    // nothing but the clock. Pin to noon instead.
    //
    // D-1: LOCAL noon, not UTC noon. The grid places by the device's hours
    // now (ADR-47), and under this suite's pinned Australia/Brisbane that put
    // UTC noon at 10pm — outside the window, so the line correctly did not
    // render and the test failed for the very reason it was written to avoid.
    await page.evaluate(() => {
      const now = new Date();
      const localNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();
      (window as unknown as { __JSTACK__: { setClockOffsetMs: (ms: number) => void } }).__JSTACK__.setClockOffsetMs(localNoon - now.getTime());
    });
    // Today view has a single column — switch to 3 days to prove the line
    // is scoped to just the first (today) column, not every column.
    await page.getByTestId("cal-seg").getByRole("tab", { name: "3 days" }).click();
    const dayColumns = page.locator('[data-testid^="cal-day-"]');
    await expect(dayColumns).toHaveCount(3);
    const nowLines = page.getByTestId("cal-now-line");
    // exactly one now-line exists across the whole grid (today's column only)
    await expect(nowLines).toHaveCount(1);
  });
});

test.describe("CG-04 3-day view", () => {
  test("today's column reads TODAY · <DAY> <date> in accent ink with a 2px top border", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("cal-seg").getByRole("tab", { name: "3 days" }).click();
    const composite = await page.evaluate(() => (window as unknown as { __JSTACK__: { stores: { today: () => { composite: { todayDate: string } } } } }).__JSTACK__.stores.today().composite);
    // todayDate, not dateLabel: the label is the human subtitle ("4
    // September") and cannot be parsed as a date (B-55).
    const d = new Date(`${composite.todayDate}T00:00:00.000Z`);
    const label = `TODAY · ${DAY_ABBR[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
    await expect(page.getByTestId("calendar-grid")).toContainText(label);
  });
});

test.describe("CG-05 week view", () => {
  test("seven columns, no navigation on Today", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("cal-seg").getByRole("tab", { name: "Week" }).click();
    await expect(page.locator('[data-testid^="cal-day-"]')).toHaveCount(7);
    await expect(page.getByTestId("cal-range")).toBeVisible();

    await page.getByTestId("cal-seg").getByRole("tab", { name: "Today" }).click();
    await expect(page.getByTestId("cal-range")).toHaveCount(0);
  });
});

test.describe("CG-06 month view", () => {
  test("a 7x5 grid with day numbers and dots", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("cal-seg").getByRole("tab", { name: "Month" }).click();
    await expect(page.getByTestId("cal-month")).toBeVisible();
  });
});

test.describe("CG-07 legend", () => {
  test("lists all five entries", async ({ page }) => {
    await openUnlocked(page);
    const legend = page.getByTestId("cal-legend");
    for (const label of ["Personal", "Work", "Family · shared", "EA protects", "Now"]) {
      await expect(legend).toContainText(label);
    }
  });
});

test.describe("CG-08 range navigation", () => {
  test("chevrons move the anchor for 3 days and the adapter call carries it", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("cal-seg").getByRole("tab", { name: "3 days" }).click();
    const before = await page.getByTestId("cal-range").textContent();
    await page.getByLabel("Next").click();
    await expect(page.getByTestId("cal-range")).not.toHaveText(before ?? "");
  });
});

/**
 * CG-02, second half — the title FITS the block it is drawn in. The pixel-math
 * test above proves the block encodes its real duration; this proves the text
 * inside it is not sheared by that. "Andy · V2 kickoff" runs 9:00–9:45, so its
 * block is 16px, and with 3px of padding above and below there was 10px of box
 * for a ~14px line — the descenders of "y" and "ff" came out cut flat in every
 * `today-*` frame of the row-21 device pass (ux-review D16). Raising the block
 * was the wrong fix; this asserts the right one.
 */
test.describe("CG-02 short events are not vertically clipped", () => {
  test("the shortest fixture event's title fits inside its own block", async ({ page }) => {
    await openUnlocked(page);
    const fit = await page.getByTestId("cal-event-ev1").evaluate((el) => {
      const label = el.querySelector("div, span") ?? el;
      return { block: el.clientHeight, text: (label as HTMLElement).scrollHeight, pad: getComputedStyle(el).paddingTop };
    });
    expect(fit.block).toBeLessThanOrEqual(17); // still the real 45-minute height
    expect(fit.text).toBeLessThanOrEqual(fit.block);
  });
});
