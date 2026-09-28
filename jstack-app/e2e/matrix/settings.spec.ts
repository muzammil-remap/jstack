/** SE-09 — Settings renders clean at every width and theme: phone full
 * screen, tablet/desktop a centred sheet (two-column grid at ≥1180). */
import { assertCleanConsole, expect, openUnlocked, test } from "../helpers";

test.describe("Settings renders clean at every width and theme", () => {
  test("opens, shows every section, and closes with no console noise", async ({ page }) => {
    const log = await openUnlocked(page);

    const rail = page.getByTestId("rail-settings");
    if (await rail.count()) {
      await rail.click();
    } else {
      await page.getByTestId("header").getByLabel("Settings").click();
    }

    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    await expect(page.getByTestId("settings-notifications")).toBeVisible();
    await expect(page.getByTestId("settings-appearance")).toBeVisible();
    await expect(page.getByTestId("settings-schedules")).toBeVisible();
    await expect(page.getByTestId("settings-autonomy")).toBeVisible();
    await expect(page.getByTestId("settings-voice")).toBeVisible();
    await expect(page.getByTestId("settings-focuses")).toBeVisible();

    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("settings-sheet")).toHaveCount(0);

    assertCleanConsole(log);
  });
});
