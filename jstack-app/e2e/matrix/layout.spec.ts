/** RL-01..07 — the responsive layout matrix, across all eight w×scheme projects. */
import { openUnlocked, pickProject, test, expect } from "../helpers";

test.describe("RL-01..04 columns", () => {
  test("the column count matches this project's width", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);

    const expected = width < 768 ? "1" : width < 1180 ? "2" : "3";
    await expect(page.getByTestId("columns")).toHaveAttribute("data-columns", expected);

    if (width < 768) {
      // RL-01: floating tab bar, no rail
      await expect(page.getByTestId("rail")).toHaveCount(0);
      await expect(page.getByTestId("tabbar")).toBeVisible();
      await expect(page.getByTestId("mic-orb")).toBeVisible();
    } else {
      // RL-02/03: rail present, no floating tab bar
      await expect(page.getByTestId("rail")).toBeVisible();
      await expect(page.getByTestId("tabbar")).toHaveCount(0);
    }

    if (width === 1920) {
      // RL-04: content stops at 1500 and sits left-aligned right after the
      // rail (200px) — not centred in the extra space, not full-bleed.
      const box = await page.getByTestId("columns").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, left: r.left };
      });
      expect(box.width).toBeLessThanOrEqual(1500);
      expect(box.left).toBeLessThan(300); // rail (200) + page padding, nowhere near centred in 1920-200
    }
  });
});

test.describe("RL-04 a screen-kind surface obeys the content cap", () => {
  test("Talk with EA is never wider than the page cap, and is centred once it is a panel", async ({ page }, testInfo) => {
    // ux-review R2-04: at 1920 the Talk composer ran x=32..1887 (1856px)
    // where Today's content stops at exactly 1500 — one 1856px button and an
    // 830px line of transcript with 700px of ground between them. The cap is
    // the page's, and a `screen` is a page.
    //
    // V-2 (TS-01/UX-J) changes the second half of that. At 1180 and up Talk
    // presents as a centred 880px PANEL over the dimmed app, so it is no
    // longer left-aligned at the page padding — it is deliberately in the
    // middle, and 880 is a tighter cap than 1500 ever was. Below 1180 it is
    // still the page, edge to edge, left-aligned. Recorded in §4.
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);
    await page.getByTestId("tab-brain").click();
    await page.getByTestId("talk-with-ea").click();
    await expect(page.getByTestId("talk-screen")).toBeVisible();
    const field = await page.getByTestId("talk-field").boundingBox();
    expect(field).not.toBeNull();
    // the defect R2-04 found stays fixed either way: never a composer wider
    // than the page allows
    expect(field!.width).toBeLessThanOrEqual(1500);

    if (width >= 1180) {
      const panel = await page.getByTestId("screen-panel").boundingBox();
      expect(panel).not.toBeNull();
      expect(panel!.width).toBeLessThanOrEqual(880 + 1);
      expect(field!.width).toBeLessThanOrEqual(880);
      // centred, with the app visible either side — the point of the panel
      expect(Math.abs(panel!.x + panel!.width / 2 - width / 2)).toBeLessThan(2);
    } else {
      // still the page: left-aligned at the padding, whatever the viewport
      expect(field!.x).toBeLessThan(100);
    }
  });
});

test.describe("RL-05 header buttons", () => {
  test("phone: Settings + Theme, health under the header; desktop: Arrange + Help + Theme, health on the rail", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);

    if (width < 768) {
      await expect(page.getByTestId("header").getByLabel("Settings")).toBeVisible();
      await expect(page.getByTestId("header").getByLabel("Arrange")).toHaveCount(0);
      await expect(page.getByTestId("header-health")).toBeVisible();
    } else {
      await expect(page.getByTestId("header").getByLabel("Arrange")).toBeVisible();
      await expect(page.getByTestId("header").getByLabel("Help")).toBeVisible();
      await expect(page.getByTestId("rail-health")).toBeVisible();
    }
    await expect(page.getByTestId("header").getByLabel("Theme")).toBeVisible();
  });
});

test.describe("RL-06 dialog and sheet sizing", () => {
  test("phone: dialog is full screen; desktop: 66vw capped at 900; the Settings sheet is 420 wide, bottom-right", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);

    if (width < 768) {
      // Help has no phone entry point (RL-05); FocusEditDialog's tune icon does.
      await page.getByLabel("Edit focuses").click();
      const box = await page.getByTestId("focus-edit-dialog").evaluate((el) => el.getBoundingClientRect());
      expect(box.width).toBeGreaterThan(width - 10); // full width, no side margins
      expect(box.height).toBeGreaterThan(400); // fills the screen, not a small centred card
    } else {
      await page.getByTestId("header").getByLabel("Help").click();
      const box = await page.getByTestId("help-dialog").evaluate((el) => el.getBoundingClientRect());
      // 900 is the pack's ceiling (handoff.md Settings, "sheet max-width 900"; B3R2-09).
      // 1000 stood here until the FULL run on the A-0 tree: at 1366, 66vw is 901.56 and
      // the tolerance hid the change; at 1920 it was 100px off (R-14).
      const expectedWidth = Math.min(width * 0.66, 900);
      expect(Math.abs(box.width - expectedWidth)).toBeLessThan(4);
      await page.getByTestId("help-dialog-close").click();

      // Settings is RL-06's own named exception (sized per SE-09, not the
      // generic sheet rule). Talk with EA used to be the plain case; V-2 made
      // it a `screen`, which has no sheet geometry at all — so Teach is the
      // plain sheet now. Same rule, a sheet that is still a sheet.
      await page.getByTestId("tab-today").click();
      await page.getByTestId("decision-more-c1").click();
      await page.getByTestId("decision-teach-c1").click();
      const sheet = await page.getByTestId("teach-sheet").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom };
      });
      expect(Math.abs(sheet.width - 420)).toBeLessThan(4);
      expect(sheet.right).toBeLessThan(50); // hugs the right edge
      expect(sheet.bottom).toBeLessThan(50); // hugs the bottom edge
    }
  });
});

test.describe("RL-07 live re-layout across breakpoints", () => {
  test("resizing across 768 keeps the open Help dialog open", async ({ page }) => {
    await openUnlocked(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByTestId("header").getByLabel("Help").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await page.setViewportSize({ width: 393, height: 830 });
    await expect(page.getByTestId("help-dialog")).toBeVisible();
  });
});
