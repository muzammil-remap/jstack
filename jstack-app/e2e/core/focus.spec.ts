/** FS-01/03/05 — focus chips. */
import { assertCleanConsole, expect, gotoTab, openUnlocked, test } from "../helpers";

test.describe("FS-01 focus chips render on every tab but Agents", () => {
  test("Everything · Personal · Family · Work + tune, on Today", async ({ page }) => {
    const log = await openUnlocked(page);
    const chips = page.getByTestId("focus-chips");
    await expect(chips).toBeVisible();
    await expect(chips.getByText("Everything")).toBeVisible();
    await expect(chips.getByText("Personal")).toBeVisible();
    await expect(chips.getByText("Family")).toBeVisible();
    await expect(chips.getByText("Work")).toBeVisible();
    assertCleanConsole(log);
  });

  test("FS-05: Agents shows no focus chips", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "agents");
    await expect(page.getByTestId("focus-chips")).toHaveCount(0);
  });
});

test.describe("FS-03 Everything widens back to the full set", () => {
  test("selecting Work then Everything returns activeFocus to 'all'", async ({ page }) => {
    await openUnlocked(page);
    const chips = page.getByTestId("focus-chips");
    await chips.getByText("Work", { exact: true }).click();
    await expect
      .poll(async () => (await page.evaluate(() => (window as any).__JSTACK__.stores.settings().activeFocus)) as string)
      .toBe("work");

    await chips.getByText("Everything", { exact: true }).click();
    await expect
      .poll(async () => (await page.evaluate(() => (window as any).__JSTACK__.stores.settings().activeFocus)) as string)
      .toBe("all");
  });
});
