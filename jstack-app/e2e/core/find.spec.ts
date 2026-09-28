/**
 * GS-02..GS-07 (K-1) — the global Find.
 *
 * The INDEX and its scoping are `tests/unit/search.test.ts`: what the server
 * returns is a statement about a response, and asserting it through a browser
 * would be asserting that React renders. What is here is what a browser is the
 * only place to check — the two surfaces, the keyboard, the phone's glyph, a
 * row that opens the right record on the right tab, and the blur.
 */
import { assertCleanConsole, calls, expect, gotoTab, openUnlocked, test } from "../helpers";

const openFind = async (page: import("@playwright/test").Page) => {
  const rail = page.getByTestId("rail-find");
  if (await rail.count()) await rail.click();
  else await page.getByTestId("header").getByLabel("Find").click();
  await expect(page.getByTestId("find")).toBeVisible();
};

const search = async (page: import("@playwright/test").Page, q: string) => {
  await page.getByTestId("find-query").fill(q);
  await page.getByTestId("find-query").press("Enter");
};

test.describe("GS-02 the desktop Find", () => {
  test("the rail opens it with the query field focused, and a query shows groups", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "the rail is a desktop control; GS-03 is the phone's way in");
    const log = await openUnlocked(page);
    await openFind(page);

    // focused ON OPEN: a search box you have to click is a search box that
    // costs two gestures, and the shortcut exists to make it cost none
    await expect(page.getByTestId("find-query")).toBeFocused();

    await search(page, "steve");
    await expect(page.getByTestId("find-group-task")).toBeVisible();
    await expect(page.getByTestId("find-group-brain")).toBeVisible();
    // the chips are the APP's focus chips, not a second set Find invented
    await expect(page.getByTestId("find").getByTestId("focus-chips")).toBeVisible();
    await expect(page.getByTestId("find-sensitivity")).toContainText("Not sensitive");
    assertCleanConsole(log);
  });

  test("Cmd/Ctrl+K opens Find rather than navigating to Brain", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "the shortcut deck is desktop-only");
    await openUnlocked(page);
    await gotoTab(page, "life");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByTestId("find")).toBeVisible();
    // and it did NOT navigate: the shortcut used to take you near the thing
    await expect(page.getByTestId("tab-life")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("GS-03 the phone's Find", () => {
  test("a glyph in the header opens the Find screen, the tab bar goes, and Close returns", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "w393-light" && testInfo.project.name !== "w393-dark", "the phone's header glyph exists below 768");
    const log = await openUnlocked(page);
    await expect(page.getByTestId("tabbar")).toBeVisible();

    await page.getByTestId("header").getByLabel("Find").click();
    await expect(page.getByTestId("find")).toBeVisible();
    // a `screen` replaces the tab bar — the point of the kind
    await expect(page.getByTestId("tabbar")).toHaveCount(0);

    await page.getByTestId("find-close").click();
    await expect(page.getByTestId("find")).toHaveCount(0);
    await expect(page.getByTestId("tabbar")).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("GS-04 a result opens its record", () => {
  test("a task result opens the task card, on the Tasks tab", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width; the opener is width-independent");
    const log = await openUnlocked(page);
    await openFind(page);
    await search(page, "moz");

    await page.locator("[data-testid^='find-row-task-']").first().click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    // the TAB moved too: a card opened from Find over Today would leave the
    // person one Close away from a tab they never chose
    await expect(page).toHaveURL(/\/tasks/);
    assertCleanConsole(log);
  });

  test("a brain result opens the capture", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width");
    await openUnlocked(page);
    await openFind(page);
    await search(page, "bali");
    await page.locator("[data-testid^='find-row-brain-']").first().click();
    await expect(page.getByTestId("brain-item")).toBeVisible();
  });
});

test.describe("GS-05 Brain's Find shows the same matches", () => {
  test("the answer card is followed by the plain matches, and they open", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    await page.getByTestId("find-input").fill("bali");
    await page.getByTestId("find-input").press("Enter");

    await expect(page.getByTestId("find-answer")).toBeVisible();
    await expect(page.getByTestId("find-results")).toBeVisible();
    // the matches come from `/search`, the one index — not from a second
    // matcher over `brainItems` that was never silo-scoped
    await expect.poll(async () => (await calls(page)).some((c) => c.method === "getSearch")).toBe(true);

    await page.locator("[data-testid^='find-row-']").first().click();
    await expect(page.getByTestId("dialog-backdrop").or(page.getByTestId("task-detail"))).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("GS-06 the cap", () => {
  test("with the parameter at its minimum the list says how many it is showing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width");
    await openUnlocked(page);
    // through the SAME action Settings uses (MC-06's rule), so the PUT runs
    // 10 is the parameter's MINIMUM (`data/parameters.ts`) — a test that set 1
    // would be asserting against a value the server refuses, and would pass
    // only because nothing checked the write landed
    await page.evaluate(() => (window as any).__JSTACK__.setParameter("search.maxResults", 10));
    await openFind(page);
    await search(page, "the");

    await expect(page.getByTestId("find-cap")).toContainText("Showing 10");
    await expect(page.getByTestId("find-cap")).toContainText("refine your search");
    // the GROUP still reports its own full count — "showing 1 of many"
    await expect(page.getByTestId("find-group-task")).not.toContainText("Tasks · 1\n");
  });
});

test.describe("GS-07 the filters scope the results", () => {
  test("'Not sensitive' shows no sensitive row, and the sensitive one is there to exclude", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width");
    const log = await openUnlocked(page);
    await openFind(page);
    await search(page, "passport");

    // the partner assertion first: without it, "no sensitive rows" would pass
    // just as well against a Find that returned nothing at all
    await expect(page.locator("[data-testid^='find-sens-']").first()).toBeVisible();

    await page.getByTestId("find-sensitivity").getByText("Not sensitive").click();
    await expect(page.locator("[data-testid^='find-sens-']")).toHaveCount(0);
    await expect(page.getByTestId("find-query")).toHaveValue("passport");

    await page.getByTestId("find-sensitivity").getByText("Sensitive only").click();
    await expect(page.locator("[data-testid^='find-sens-']").first()).toBeVisible();
    assertCleanConsole(log);
  });

  test("a focus chip re-runs the query on the server rather than filtering rows in hand", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width");
    await openUnlocked(page);
    await openFind(page);
    await search(page, "bali");
    const before = (await calls(page)).filter((c) => c.method === "getSearch").length;

    await page.getByTestId("find").getByTestId("focus-chips").getByText("Work", { exact: true }).click();
    await expect.poll(async () => (await calls(page)).filter((c) => c.method === "getSearch").length).toBeGreaterThan(before);
    const last = (await calls(page)).filter((c) => c.method === "getSearch").pop();
    expect(JSON.stringify(last?.args)).toContain("work");
  });

  test("under privacy blur a sensitive row is blurred, and the first tap reveals it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width");
    await openUnlocked(page);
    await page.evaluate(() => (window as any).__JSTACK__.setPrivacy(true));
    await openFind(page);
    await search(page, "passport");

    const row = page.locator("[data-testid^='find-row-brain-']").first();
    await expect(row.locator("[data-sens='blurred']").first()).toBeVisible();

    // the first tap REVEALS rather than opening — the point of the blur is
    // that you decide to look, and opening the record would skip the decision
    await row.click();
    await expect(page.getByTestId("brain-item")).toHaveCount(0);
    await expect(row.locator("[data-sens='blurred']")).toHaveCount(0);

    await row.click();
    await expect(page.getByTestId("brain-item")).toBeVisible();
  });
});

test.describe("GS-02 a group's count is a Marker badge on its label, not inline text (K1-11 — P-9)", () => {
  test("the Tasks group reads its label and its count as two things", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "covered at one width; the label is width-independent");
    await openUnlocked(page);
    await page.getByTestId("rail-find").click();
    const input = page.getByTestId("find").getByRole("textbox").first();
    await input.fill("passport");
    await input.press("Enter");
    const label = page.getByTestId("find-group-task").locator("xpath=./div[1]");
    await expect(label).toHaveText(/^Tasks\s*\d+$/);
    await expect(label).not.toContainText("·");
  });
});
