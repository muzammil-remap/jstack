/** AR-01..07, GL-08, CT-05. Arrange is desktop-only (RL-05: phone gets
 * Settings, not Arrange) — every test here runs on w1366-light only. */
import { expect, expectToast, gotoTab, openUnlocked, store, test } from "../helpers";

test.describe("AR-01..07 Arrange", () => {
  test("AR-01/02/03 opens the list, reorders, hides, and pins block the switch", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "Arrange is desktop-only, RL-05");
    await openUnlocked(page);
    await page.getByTestId("header").getByLabel("Arrange").click();
    await expect(page.getByTestId("arrange-dialog")).toBeVisible();
    await expect(page.getByTestId("arrange-dialog")).toContainText("Arrange · Today");

    // AR-03: the pinned "Needs you" row carries the meta line and no switch
    await expect(page.getByTestId("arrange-row-needs")).toContainText("cannot be hidden");
    await expect(page.getByTestId("arrange-hide-needs")).toHaveCount(0);

    // AR-02: move "At a glance" up, persisted via PUT /layout/today
    const before = (await store(page, "settings")).layouts.today.order as string[];
    await page.getByTestId("arrange-up-glance").click();
    await expect
      .poll(async () => (await store(page, "settings")).layouts.today.order as string[])
      .not.toEqual(before);

    // AR-03: hide a non-pinned section, then show it again
    await page.getByTestId("arrange-hide-glance").click();
    await expect.poll(async () => (await store(page, "settings")).layouts.today.hidden).toContain("glance");
    await page.getByTestId("arrange-hide-glance").click();
    await expect.poll(async () => (await store(page, "settings")).layouts.today.hidden).not.toContain("glance");
  });

  test("AR-04 App: focus row switch, tab visibility, hiding the current tab returns to Today", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "Arrange is desktop-only, RL-05");
    await openUnlocked(page);
    await gotoTab(page, "life");
    await page.getByTestId("header").getByLabel("Arrange").click();
    await expect(page.getByTestId("arrange-dialog")).toContainText("Arrange · Life");

    await expect(page.getByTestId("arrange-tab-row-today")).toHaveCount(0); // Today is never a choice

    await page.getByTestId("arrange-focus-row").click();
    await expect.poll(async () => (await store(page, "settings")).appLayout.showFocusRow).toBe(false);

    // hiding the tab you're currently viewing closes the dialog and returns to Today
    await page.getByTestId("arrange-tab-life").click();
    await expect(page.getByTestId("arrange-dialog")).toHaveCount(0);
    await expect(page.getByTestId("tab-screen-today")).toBeVisible();
    await expect(page.getByTestId("tab-life")).toHaveCount(0); // gone from the rail too

    // put it back so later tests in this file see a clean rail
    await page.getByTestId("header").getByLabel("Arrange").click();
    await page.getByTestId("arrange-tab-life").click();
    await expect(page.getByTestId("tab-life")).toBeVisible();
  });

  test("AR-05 Revert to yesterday restores the layout and toasts", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "Arrange is desktop-only, RL-05");
    await openUnlocked(page);
    await page.getByTestId("header").getByLabel("Arrange").click();
    await page.getByTestId("arrange-hide-glance").click();
    await expect.poll(async () => (await store(page, "settings")).layouts.today.hidden).toContain("glance");

    await page.getByTestId("arrange-revert").click();
    await expectToast(page, "Reverted to yesterday");
    await expect.poll(async () => (await store(page, "settings")).layouts.today.hidden).not.toContain("glance");
  });

  test("AR-06 an EA proposal shows the banner with its reason; Revert clears it", async ({ page }) => {
    await openUnlocked(page);
    await page.evaluate(() => (window as unknown as { __JSTACK__: { eaLayout: (t: string, o: string[], r: string) => Promise<void> } }).__JSTACK__.eaLayout(
      "today",
      ["insights", "needs", "allcal", "calendar", "tasks", "glance", "close"],
      "mornings run smoother with your notes first",
    ));
    await expect(page.getByTestId("ea-layout-banner")).toBeVisible();
    await expect(page.getByTestId("ea-layout-banner")).toContainText("mornings run smoother with your notes first");

    await page.getByTestId("ea-layout-revert").click();
    await expectToast(page, "Reverted to your arrangement");
    await expect(page.getByTestId("ea-layout-banner")).toHaveCount(0);
  });

  test("GL-08/CT-05 flipping a capability flips Help and the Health section", async ({ page }, testInfo) => {
    // Help has no phone entry point yet, same as shell.spec.ts's GL-08 (BUGLOG_v2.md row 11 note)
    test.skip(testInfo.project.name === "w393-light", "Help has no phone entry point yet");
    await openUnlocked(page);
    await page.getByTestId("header").getByLabel("Help").click();
    await expect(page.getByTestId("help-dialog")).toContainText("Health data feed");
    // the row for healthFeed reads "not available yet" while it's off
    const row = page.getByTestId("help-dialog").locator("text=Health data feed").locator("..");
    await expect(row).toContainText("not available yet");
    await page.getByTestId("help-dialog-close").click();

    await gotoTab(page, "life");
    await expect(page.getByTestId("health-ghost")).toBeVisible();

    await page.evaluate(() => (window as unknown as { __JSTACK__: { setCapability: (k: string, v: boolean) => Promise<void> } }).__JSTACK__.setCapability("healthFeed", true));
    await expect(page.getByTestId("health-ghost")).toHaveCount(0);

    await page.getByTestId("header").getByLabel("Help").click();
    await expect(page.getByTestId("help-dialog").locator("text=Health data feed").locator("..")).toContainText("on");

    // put it back so later tests in this file see the fixture default
    await page.evaluate(() => (window as unknown as { __JSTACK__: { setCapability: (k: string, v: boolean) => Promise<void> } }).__JSTACK__.setCapability("healthFeed", false));
  });
});

test.describe("CB-03 Arrange lists configured sections (B-2)", () => {
  test("a config record arranges exactly like a component does", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "Arrange is desktop-only, RL-05");
    await openUnlocked(page);
    await gotoTab(page, "life");
    await page.getByTestId("header").getByLabel("Arrange").click();
    await expect(page.getByTestId("arrange-dialog")).toContainText("Arrange · Life");

    // Goals and Habits are components; People, Money, Learning and Health are
    // §4.10 records. Arrange cannot tell, and that is the requirement.
    for (const id of ["goals", "habits", "people", "money", "learning", "health"]) {
      await expect(page.getByTestId(`arrange-row-${id}`)).toBeVisible();
    }

    await page.getByTestId("arrange-hide-money").click();
    await expect.poll(async () => (await store(page, "settings")).layouts.life.hidden).toContain("money");
    await page.getByTestId("arrange-dialog-close").click();
    await expect(page.getByTestId("life-money-section")).toHaveCount(0);
    await expect(page.getByTestId("life-people-section")).toBeVisible();

    await page.getByTestId("header").getByLabel("Arrange").click();
    await page.getByTestId("arrange-hide-money").click();
    await page.getByTestId("arrange-dialog-close").click();
    await expect(page.getByTestId("life-money-section")).toBeVisible();
  });
});

/**
 * Josh's A-0 row 2 (B3R2-08): Arrange's verb row reads like every other —
 * the primary first, no narrower than the secondary.
 */
test.describe("B3R2-08 Arrange's verb row", () => {
  test("Done comes before Revert to yesterday and is at least as wide", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "RL-05: Arrange is desktop-only");
    await openUnlocked(page);
    await page.getByTestId("header").getByLabel("Arrange").click();
    await expect(page.getByTestId("arrange-dialog")).toBeVisible();
    const done = await page.getByTestId("arrange-done").boundingBox();
    const revert = await page.getByTestId("arrange-revert").boundingBox();
    expect(done!.x).toBeLessThan(revert!.x);
    expect(done!.width).toBeGreaterThanOrEqual(revert!.width - 1);
    const dialog = await page.getByTestId("arrange-dialog").boundingBox();
    expect(dialog!.width).toBeLessThanOrEqual(900);
  });
});
