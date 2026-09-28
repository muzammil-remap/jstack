/**
 * TZ-03/TZ-04 (as amended) and TD-06 — the app reads the DEVICE's clock.
 *
 * This file used to assert the opposite, and correctly so: under ADR-29 the
 * whole app ran on a fixed Brisbane basis, and three browsers in three zones
 * had to render byte-identical dates or something was reading a local field it
 * should not have. ADR-47 inverted the rule — a Los Angeles browser showing
 * Brisbane times is now the DEFECT — so the assertion inverts with it. The
 * change is recorded in `02_ACCEPTANCE_TESTS_v22.md` §4.
 *
 * Two claims survive the inversion, and they are the two worth having:
 *
 *  1. **The app agrees with the device.** The day the header names is the day
 *     that browser's zone is actually on, computed here by `Intl` rather than
 *     by the code under test — an independent second opinion, which is the
 *     only kind worth asserting a formatter against.
 *
 *  2. **The app agrees with itself.** Whatever zone it is in, the header, the
 *     calendar's today column and the grid's now-line describe ONE instant.
 *     That is what R15-01 broke: the Gantt read `30 Aug │ today │ 27 Sep`
 *     beside Today's `Saturday 5 September`, in the same capture run, because
 *     two surfaces read different fields of the same date.
 *
 * Both zones are driven inside one test through two browser contexts rather
 * than two tests sharing state: a timezone is a context option, the comparison
 * is the whole assertion, and this way it cannot be half-run.
 */
import { expect, installVirtualAuthenticator, test } from "../helpers";
import type { Browser, Page } from "@playwright/test";

/** Nineteen hours apart at their closest, and LA observes DST while Brisbane
 *  never does — so no fixed offset can satisfy both. */
const ZONES = ["Australia/Brisbane", "America/Los_Angeles"] as const;

type Reading = {
  headerDate: string;
  todayColumn: string;
  isoOnScreen: string[];
};

/**
 * What day it is in a zone, right now, decided WITHOUT the app.
 *
 * `Intl` with an explicit `timeZone` is a different implementation from the
 * one under test — `lib/time.ts` reads the platform's local getters and never
 * asks `Intl` for a date. If the two agree, the app is formatting in the zone
 * it claims to be.
 */
function dayNumberIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone, day: "numeric" }).format(new Date());
}
function monthNameIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone, month: "long" }).format(new Date());
}

async function readIn(browser: Browser, timezoneId: string, baseURL: string | undefined): Promise<Reading> {
  const context = await browser.newContext({ timezoneId, baseURL });
  const page: Page = await context.newPage();
  try {
    await installVirtualAuthenticator(page);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId("facelock").click();
    await expect(page.getByTestId("tab-today")).toBeVisible({ timeout: 15000 });

    const headerDate = (await page.getByTestId("header").innerText()).trim();
    // the calendar's own name for today — a second surface, derived
    // independently of the header inside the app
    const todayColumn = (await page.locator("[data-testid^='cal-day-']").first().innerText().catch(() => "")).trim();
    // TD-05's rendered half: no instant reaches a screen raw
    const isoOnScreen = await page.locator("text=/\\d{4}-\\d{2}-\\d{2}T/").allInnerTexts();

    return { headerDate, todayColumn, isoOnScreen };
  } finally {
    await context.close();
  }
}

test.describe("TZ-03/TZ-04, TD-06 · the device's zone is the one on screen", () => {
  // two full app boots; the default 45s is not enough on a cold worker
  test.setTimeout(180_000);

  test("each zone shows ITS OWN day, and no surface disagrees with another", async ({ browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "w1366-light", "one boot per zone is expensive; the desktop project is enough");

    const readings: Record<string, Reading> = {};
    for (const zone of ZONES) readings[zone] = await readIn(browser, zone, baseURL);

    for (const zone of ZONES) {
      const r = readings[zone];
      // the guard's own guard: if the header rendered nothing date-shaped,
      // every comparison below would be a comparison of empty strings
      expect(r.headerDate.length, `header in ${zone}`).toBeGreaterThan(10);

      // 1. the app agrees with the device — the day and month `Intl` says it
      //    is THERE, not here and not UTC
      expect(r.headerDate, `the day of the month, in ${zone}`).toContain(dayNumberIn(zone));
      expect(r.headerDate, `the month, in ${zone}`).toContain(monthNameIn(zone));

      // 2. the app agrees with itself — the calendar's today column carries
      //    the same day number the header does
      expect(r.todayColumn, `the calendar's today column, in ${zone}`).toContain(dayNumberIn(zone));

      // 3. and nothing raw reached the screen
      expect(r.isoOnScreen, `raw instants on screen in ${zone}`).toEqual([]);
    }

    /**
     * And the inversion itself, stated: when the two zones are on different
     * calendar days — which they are for nineteen hours out of every
     * twenty-four — the app says so. Conditional on the real clock rather than
     * asserted blindly, because a test that fails for five hours a day is a
     * test nobody trusts; the branch below runs on almost every execution and
     * the `else` records what it means when it does not.
     */
    const [brisbane, la] = ZONES.map((z) => dayNumberIn(z));
    if (brisbane !== la) {
      expect(readings[ZONES[0]].headerDate).not.toBe(readings[ZONES[1]].headerDate);
    } else {
      expect(readings[ZONES[0]].headerDate).toBe(readings[ZONES[1]].headerDate);
    }
  });
});
