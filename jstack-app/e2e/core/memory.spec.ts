/** BR-06..12 — Brain's Memory (proposals, hit rate) and Rules cards. */
import { db, expect, expectToast, expectUndoToast, gotoTab, openUnlocked, settle, test, undo } from "../helpers";

async function openBrain(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "brain");
  return log;
}

test.describe("BR-06 Memory — accept", () => {
  test("ok accepts, toasts, and undo restores", async ({ page }) => {
    await openBrain(page);
    await expect(page.getByTestId("proposal-p1")).toBeVisible();
    await page.getByTestId("proposal-ok-p1").click();
    await expectUndoToast(page, "Accepted · versioned, nothing overwritten");
    await expect(page.getByTestId("proposal-p1")).toHaveCount(0);

    await undo(page);
    await expect(page.getByTestId("proposal-p1")).toBeVisible();
  });
});

test.describe("BR-07 Memory — edit", () => {
  test("edit dialog saves the correction and teaches", async ({ page }) => {
    await openBrain(page);
    await page.getByTestId("proposal-edit-p2").click();
    await expect(page.getByTestId("proposal-edit")).toBeVisible();

    await page.getByTestId("proposal-edit-input").fill("File Moz discovery call under Work · JStack (v2 launch)");
    await page.getByTestId("proposal-edit-save").click();
    await expectToast(page, "Saved · the Librarian learns from the correction");
    await expect(page.getByTestId("proposal-edit")).toHaveCount(0);
    await expect(page.getByTestId("proposal-p2")).toHaveCount(0);
  });
});

test.describe("BR-08 Memory — empty", () => {
  test("all caught up once every proposal is resolved", async ({ page }) => {
    await openBrain(page);
    for (const id of ["p1", "p2", "p3", "p4"]) {
      await settle(page); // each proposal moves up into the last one's place (B-246)
      await page.getByTestId(`proposal-ok-${id}`).click();
      await expect(page.getByTestId(`proposal-${id}`)).toHaveCount(0);
    }
    await expect(page.getByTestId("memory-empty")).toContainText("All caught up. The Librarian runs again at 2:00.");
  });
});

test.describe("BR-09 Memory — hit rate", () => {
  test("shows the weekly line and fix opens the wrong answers", async ({ page }) => {
    await openBrain(page);
    await expect(page.getByTestId("memory-hitrate")).toContainText("41 of 46 test questions right last week");
    // expected value updated at row 22 — the old string was the DEFECT
    // ("1 rules misled", "3 miss"), not the spec: ux-review D28, logged as
    // A-42 and recorded in 02_ACCEPTANCE_TESTS_v2.md §4 before this moved.
    await expect(page.getByTestId("memory-hitrate")).toContainText("2 wrong sources · 3 misses · 1 rule misled");

    await page.getByTestId("hitrate-fix").click();
    await expect(page.getByTestId("external-link-dialog")).toBeVisible();
    await expect(page.getByTestId("external-link-dialog")).toContainText("the wrong answers and their sources");
  });
});

/**
 * BR-10/BR-11/BR-12 LEFT BRAIN AT ST-1, and this is where they went.
 *
 * V2.1's `Rule` was a numbered sentence on Brain that said nothing about when
 * it applies or whether the EA should act on it or ask first. It is an
 * `AutonomyRule` under Settings › Rules for my EA now — the list the mock
 * actually obeys — and its three claims are asserted there instead:
 *
 *   BR-10 the list, and what the footer says   → ST-02, `settings.spec.ts`
 *   BR-11 edit and remove                      → ST-02, `settings.spec.ts`
 *   BR-12 a rule taught from a card            → ST-04, `settings.spec.ts`
 *
 * Recorded in `02_ACCEPTANCE_TESTS_v22.md` §4 rather than deleted, because
 * three acceptance IDs quietly losing their tests is how a promise stops being
 * kept without anybody deciding to stop keeping it.
 */
