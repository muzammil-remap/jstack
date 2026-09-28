/** CG-07 (both themes), RL-07 (Today's own reflow) — across all eight w×scheme projects. */
import { assertCleanConsole, expect, openUnlocked, pickProject, test } from "../helpers";

test.describe("Today renders clean at every width and theme", () => {
  test("Needs you, the calendar grid and Close the day all mount with no console errors", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    const log = await openUnlocked(page);

    await expect(page.getByTestId("decision-card-c1")).toBeVisible();
    await expect(page.getByTestId("calendar-grid")).toBeVisible();
    await expect(page.getByTestId("close-day")).toBeVisible();

    const expectedColumns = width < 768 ? "1" : width < 1180 ? "2" : "3";
    await expect(page.getByTestId("columns")).toHaveAttribute("data-columns", expectedColumns);

    assertCleanConsole(log);
  });

  test("the calendar track height stays 336px regardless of column layout", async ({ page }) => {
    await openUnlocked(page);
    const track = page.locator('[data-testid^="cal-track-"]').first();
    await expect(track).toHaveCSS("height", "336px");
  });
});
