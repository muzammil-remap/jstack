/**
 * OP-01..OP-06 (O-1) — everything listed opens (ADR-52).
 *
 * V2.1 shipped two versions of the same failure and neither was visible from a
 * screenshot: rows that looked tappable and were not (Find's results, Latest
 * in, Agents history, Issues, Learning), and a verb that toasted "Opened" over
 * a screen where nothing had opened. A row with a chevron that does nothing is
 * worse than a row without one — it teaches a person the app is broken and
 * then makes them prove it.
 *
 * OP-07's walker holds the RULE in Jest; these are the doors themselves.
 */
import { assertCleanConsole, expect, gotoTab, openUnlocked, test } from "../helpers";

type Page = import("@playwright/test").Page;

async function openBrain(page: Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "brain");
  return log;
}

test.describe("OP-01 a Find result opens its record", () => {
  test("the row opens the item, with the query highlighted", async ({ page }) => {
    const log = await openBrain(page);
    await page.getByTestId("find-input").fill("Steve");
    await page.getByTestId("find-input").press("Enter");
    await expect(page.getByTestId("find-results")).toBeVisible();

    // K-1 re-pointed these rows at `GET /search`, so the list now carries every
    // KIND and tasks come first (§7's order). OP-01's claim is about a BRAIN
    // result opening its capture, so it names one rather than taking whatever
    // is at the top — the B-15/B-23/LF-08 lesson: assert the end, not the means.
    await page.getByTestId("find-results").locator("[data-testid^='find-row-brain-']").first().click();
    await expect(page.getByTestId("brain-item")).toBeVisible();
    await expect(page.getByTestId("brain-item-text")).toBeVisible();
    // OP-01: the query's matches carry the accent tone, so the reason this
    // record came back is visible in the record
    await expect(page.locator("[data-testid^='brain-item-hit-']").first()).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("OP-02 a Latest in row opens the item", () => {
  test("the row opens it, showing what the EA did with it", async ({ page }) => {
    const log = await openBrain(page);
    // click the row's TOP-LEFT rather than its centre: the third line carries
    // an inline `edit` link, and a centre click lands on it and opens the
    // editor instead — a row with two destinations needs the test to say
    // which one it means
    const row = page.getByTestId("latest-in").locator("[data-testid^='latest-open-']").first();
    const rowId = (await row.getAttribute("data-testid"))!.replace("latest-open-", "");
    const rowTags = await page.getByTestId(`latest-tags-${rowId}`).locator("[data-tag='1']").allTextContents();
    await row.click({ position: { x: 12, y: 10 } });
    await expect(page.getByTestId("brain-item")).toBeVisible();
    await expect(page.getByTestId("brain-item-meta")).toBeVisible();
    await expect(page.getByTestId("brain-item-labels")).toBeVisible();
    // P-1 (Stage 5d, F-69): the detail's tags ARE the row's tags — one
    // `captureTags` composition (RP-06), so the silo reads "family", never the
    // wire key `family1` (rule 21), and the row's `sensitive` tag is on the
    // detail too. Both lists off the DOM, in order.
    expect(rowTags.length).toBeGreaterThan(0);
    expect(await page.getByTestId("brain-item-labels").locator("[data-tag='1']").allTextContents()).toEqual(rowTags);
    assertCleanConsole(log);
  });
});

test.describe("OP-03 Memory's all is the history", () => {
  test("it lists what was decided, by whom, and what the value was before", async ({ page }) => {
    const log = await openBrain(page);
    await page.getByTestId("memory-all").click();
    await expect(page.getByTestId("memory-history-dialog")).toBeVisible();
    const rows = page.locator("[data-testid^='memory-history-row-']");
    await expect(rows.first()).toBeVisible();
    // the previous value is the thing you came here to check
    await expect(page.locator("[data-testid^='memory-history-was-']").first()).toContainText("was:");
    assertCleanConsole(log);
  });
});

test.describe("OP-04 a decision opens as answered", () => {
  test("an Agents history row opens the card, its options and the receipt", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "agents");
    await page.getByTestId("history-search").click();
    await expect(page.getByTestId("agents-history-dialog")).toBeVisible();

    await page.locator("[data-testid^='agents-history-row-']").first().click();
    await expect(page.getByTestId("decision")).toBeVisible();
    await expect(page.getByTestId("decision-title")).toBeVisible();
    // the receipt: a cost nobody can trace is a number nobody can check
    await expect(page.getByTestId("decision-receipt")).toContainText("$");
    assertCleanConsole(log);
  });
});

test.describe("OP-05 an issue opens", () => {
  test("the row opens what failed and when it last worked; all lists them", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "agents");

    await page.locator("[data-testid^='issue-e']").first().click();
    await expect(page.getByTestId("issue")).toBeVisible();
    await expect(page.getByTestId("issue-why")).toBeVisible();
    await expect(page.getByTestId("issue-last-success")).toBeVisible();
    await page.getByTestId("issue-close").click();

    await page.getByTestId("issues-all").click();
    await expect(page.getByTestId("issues-all-dialog")).toBeVisible();
    await expect(page.locator("[data-testid^='issues-all-row-']").first()).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("OP-06 a Learning row opens", () => {
  test("the row's verb opens the item rather than toasting that it did", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "life");

    // the configured section's row verb — `open`, given to it at O-1.
    // `RowsBlock` names it `${idPrefix}-act-${id}`, and the Learning section's
    // idPrefix is "learning" (sections.json).
    const verb = page.locator("[data-testid^='learning-act-']").first();
    await verb.scrollIntoViewIfNeeded();
    await verb.click();

    await expect(page.getByTestId("learning")).toBeVisible();
    await expect(page.getByTestId("learning-title")).toBeVisible();
    // and it did NOT toast "Opened" over a screen where nothing opened —
    // the defect this row exists to remove
    await expect(page.getByTestId("toast")).toHaveCount(0);
    assertCleanConsole(log);
  });
});
