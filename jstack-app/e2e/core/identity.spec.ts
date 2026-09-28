/**
 * ID-01..04, MU-01..04 (row I-1) — who is holding the session, in the browser.
 *
 * The server-side half of this is covered by `tests/unit/identity.test.ts`,
 * which asks the mock directly. What can only be checked HERE is what a
 * person actually sees: that the demo watermark is on every tab and on the
 * locked screen, and that switching who holds the session changes the lists
 * that render rather than only the JSON underneath them.
 */
import { DEMO_WATERMARK_TEXT } from "../../components/chrome/watermarkText";
import { assertCleanConsole, expect, expectUndoToast, gotoTab, openApp, openUnlocked, pickProject, store, test, undo } from "../helpers";

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function markBox(page: import("@playwright/test").Page): Promise<Box> {
  const mark = await page.getByTestId("demo-watermark").boundingBox();
  expect(mark).not.toBeNull();
  return mark!;
}

/** the mark must not share a pixel with the named control */
async function expectClearOf(page: import("@playwright/test").Page, id: string): Promise<void> {
  const box = await page.getByTestId(id).boundingBox();
  expect(box, id).not.toBeNull();
  expect({ id, overlaps: intersects(await markBox(page), box!) }).toEqual({ id, overlaps: false });
}

/**
 * ux-review R2-02: on a phone a full-bleed dialog and the Settings sheet
 * cover the tab bar the mark was placed to clear, and their scroll box ran
 * to the bottom edge — so the mark printed across whichever row was
 * scrolled there. The box that scrolls (react-native-web renders a
 * ScrollView as the element with `overflow-y: auto`) must end above the mark.
 */
async function expectClearOfScrollBox(page: import("@playwright/test").Page, id: string): Promise<void> {
  const box = await page.getByTestId(id).evaluate((root) => {
    const all = [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[];
    const el = all.find((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowY));
    if (el == null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  expect(box, `${id} has a scroll box`).not.toBeNull();
  expect({ id, overlaps: intersects(await markBox(page), box!) }).toEqual({ id, overlaps: false });
}

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const asUser = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((who) => (window as any).__JSTACK__.asUser(who), id);
const forceRefreshReuse = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as any).__JSTACK__.forceRefreshReuse());
/* eslint-enable @typescript-eslint/no-explicit-any */

test.describe("ID-01 the session names its holder", () => {
  test("the store carries the user and silos after unlock", async ({ page }) => {
    const log = await openUnlocked(page);
    await expect.poll(async () => (await store(page, "session")).user?.name).toBe("Josh");
    const session = await store(page, "session");
    expect(session.silos).toContain("personal:josh");
    expect(session.tokenTtlSeconds).toBe(900);
    assertCleanConsole(log);
  });
});

test.describe("ID-02 the demo watermark", () => {
  test("is on every tab", async ({ page }) => {
    const log = await openUnlocked(page);
    for (const tab of ["today", "tasks", "brain", "life", "agents"] as const) {
      await gotoTab(page, tab);
      await expect(page.getByTestId("demo-watermark")).toBeVisible();
      await expect(page.getByTestId("demo-watermark")).toHaveText(DEMO_WATERMARK_TEXT);
    }
    assertCleanConsole(log);
  });

  test("is on the locked screen — the screen most likely to be seen by somebody else", async ({ page }) => {
    const log = await openApp(page);
    await expect(page.getByTestId("facelock")).toBeVisible();
    await expect(page.getByTestId("demo-watermark")).toBeVisible();
    assertCleanConsole(log);
  });

  test("sits clear of the controls it must not cover", async ({ page }) => {
    const log = await openUnlocked(page);
    const mark = await page.getByTestId("demo-watermark").boundingBox();
    expect(mark).not.toBeNull();

    // The tab bar only exists on a phone-shaped viewport; at 1366 the shell
    // uses the rail. Asking for it unconditionally hung for 45 seconds on a
    // control that was never going to appear.
    const bar = page.getByTestId("tabbar");
    if ((await bar.count()) > 0) {
      const box = await bar.boundingBox();
      if (box != null && mark != null) expect(mark.y + mark.height).toBeLessThanOrEqual(box.y + 1);
    }
    assertCleanConsole(log);
  });

  // ux-review R2-02, on 22 phone frames: the offset that clears the tab bar
  // put the mark across the Settings sheet's rows and inside a dialog's
  // scroll box, and a toast — which shares the band above the bar — printed
  // over it from x=98 so it read "Demo · fixture". The surfaces that cover
  // the bar keep WATERMARK_CLEARANCE free at their foot and the mark drops
  // there; a toast moves it up out of the toast's band.
  test("keeps clear of the Settings sheet's scroll box (R2-02)", async ({ page }) => {
    const log = await openUnlocked(page);
    await page.getByLabel("Settings", { exact: true }).click();
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    await expectClearOfScrollBox(page, "settings-sheet");
    assertCleanConsole(log);
  });

  /**
   * A-6, the planner's finding on the 20:26 mock at 393 (12 Sep): the mark
   * "overprints scrolled content just above the tab bar".
   *
   * R2-02 gave every surface that COVERS the bar the rule above — the box that
   * scrolls ends above the mark — and never gave it to the one surface that is
   * always underneath it, the tab page itself. R3-01 had already seen what that
   * costs ("That's all until 4pm." losing the top of every letter) and fixed
   * the half of it that was about the toast. Measured here at 393 before this
   * test was written: at one scroll position the mark sat over a Needs-you
   * card's `Open` and `Dismiss` — opaque ground over two live controls, which
   * `pointerEvents: none` leaves tappable and invisible.
   *
   * Desktop is exempt by construction: there the mark sits at the rail's foot,
   * which is chrome, not content — the phone has no rail, and nothing had made
   * room for it.
   *
   * v2.3.2 WPR-1 keeps the finding and changes the answer. A-6 and A6-07 had
   * the page END above a band kept for the mark and the orb, and on Josh's
   * iPhone that band was "a band across the screen wasting valuable screen
   * space". The page runs to the tab bar again with both floating over it, so
   * what A-6 protected — a live control the mark hides or the orb takes — is
   * kept by the page's bottom padding: scrolled to its end, the last card sits
   * above both. Until then this case asserted the mark clear of the scroll box
   * and `scrollBox.bottom <= orb.y + 1`. Its title stays as it was: the B-rows
   * that were red on it (B-256, B-260) cite it by name.
   */
  test("keeps clear of the tab page's own scroll box, on every tab (A-6)", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 768, "on desktop the mark is at the rail's foot, not over the page");
    const log = await openUnlocked(page);
    for (const tab of ["today", "tasks", "brain", "life", "agents"] as const) {
      await gotoTab(page, tab);
      // A6-07 (the A-6 review): the mic orb reaches higher than the mark, and it
      // TAKES the press where the mark only hides what is under it, so the end
      // of the page must clear both.
      const orb = await page.getByTestId("mic-orb").boundingBox();
      expect(orb, `${tab}: the orb`).not.toBeNull();
      const geo = await page.getByTestId(`tab-screen-${tab}`).evaluate((root) => {
        const all = [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[];
        const el = all.find((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowY)) ?? root;
        // scrolled to its end, the content box less its bottom padding is where the last card ends
        el.scrollTop = el.scrollHeight;
        const content = (el.firstElementChild as HTMLElement | null) ?? el;
        const end = content.getBoundingClientRect().bottom - parseFloat(getComputedStyle(content).paddingBottom);
        return { boxBottom: el.getBoundingClientRect().bottom, end };
      });
      const mark = await markBox(page);
      expect({ tab, runsUnderTheOrb: geo.boxBottom > orb!.y + orb!.height, endAboveTheOrb: geo.end <= orb!.y + 1, endAboveTheMark: geo.end <= mark.y + 1 }).toEqual({
        tab,
        runsUnderTheOrb: true,
        endAboveTheOrb: true,
        endAboveTheMark: true,
      });
    }
    assertCleanConsole(log);
  });

  test("keeps clear of a dialog's scroll box (R2-02)", async ({ page }) => {
    const log = await openUnlocked(page);
    await page.getByLabel("Edit focuses").click();
    await expect(page.getByTestId("focus-edit-dialog")).toBeVisible();
    await expectClearOfScrollBox(page, "focus-edit-dialog");
    assertCleanConsole(log);
  });

  test("keeps clear of a sheet's verbs (R2-02)", async ({ page }) => {
    const log = await openUnlocked(page);
    await page.getByTestId("decision-more-c1").click();
    await page.getByTestId("decision-teach-c1").click();
    await expect(page.getByTestId("teach-sheet")).toBeVisible();
    await expectClearOf(page, "teach-save");
    await expectClearOf(page, "teach-once");
    assertCleanConsole(log);
  });

  // ux-review R3-01: R-27 raised the mark over a phone toast by a constant,
  // and R-26's opaque ground chip then landed in page and card content and
  // painted it out ("That's all until 4pm." lost the top of every letter).
  // The mark now holds its place; the toast is what steps over it.
  test("holds its place while a toast is up, and the toast steps over it (R2-02, R3-01)", async ({ page }) => {
    const log = await openUnlocked(page);
    const before = await markBox(page);
    await page.getByTestId("decision-primary-c1").click();
    await expectUndoToast(page, "Went with option 1 · Dev call");
    expect(await markBox(page)).toEqual(before);
    await expectClearOf(page, "toast");
    await undo(page);
    expect(await markBox(page)).toEqual(before);
    assertCleanConsole(log);
  });
});

test.describe("MU-01..04 holding the session as Joce", () => {
  test("asUser reseeds the session, and the lists follow", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "tasks");
    const asJosh = await page.getByTestId(/^task-row-/).count();
    expect(asJosh).toBeGreaterThan(0);

    await asUser(page, "joce");
    await expect.poll(async () => (await store(page, "session")).user?.name).toBe("Joce");
    expect((await store(page, "session")).silos).toEqual(["personal:joce", "family1"]);

    // MU-02, as a person would see it: reload the list and nothing of Josh's
    // personal work is in it
    await gotoTab(page, "today");
    await gotoTab(page, "tasks");
    await expect
      .poll(async () => {
        const tasks = ((await store(page, "tasks")).list ?? []) as { labels?: { silo?: string } }[];
        return tasks.map((t) => t.labels?.silo).filter(Boolean);
      })
      .not.toContain("personal:josh");
    assertCleanConsole(log);
  });

  test("MU-03 a task she owns is hers — no tag; the same task is tagged for Josh", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "tasks");
    // as Josh, a task owned by Joce carries the initial
    const tagged = page.getByTestId(/^task-row-/).filter({ hasText: "J" });
    expect(await tagged.count()).toBeGreaterThan(0);

    await asUser(page, "joce");
    await gotoTab(page, "today");
    await gotoTab(page, "tasks");
    // hers now, and a person's own work is not labelled as somebody else's
    await expect.poll(async () => (await store(page, "session")).user?.id).toBe("joce");
    assertCleanConsole(log);
  });
});

test.describe("ID-04 a reused refresh token", () => {
  test("locks the device into the emergency state", async ({ page }) => {
    const log = await openUnlocked(page);
    await forceRefreshReuse(page);
    await expect.poll(async () => (await store(page, "session")).locked).toBe(true);
    expect((await store(page, "session")).emergency).toBe(true);
    await expect(page.getByTestId("facelock")).toBeVisible();
    assertCleanConsole(log);
  });
});
