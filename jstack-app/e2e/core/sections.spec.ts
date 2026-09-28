/**
 * CB-05..CB-08, CB-10 (B-3) — the EA proposes a section, and Josh decides.
 *
 * The whole point of §4.10 is that a new section is a DECISION, not a
 * deploy: it arrives as a card with a reason, it previews itself, and
 * nothing on any tab changes until a verb says so. Every test here checks
 * both halves — the card AND the tab — because a card that says a section
 * was added while the tab shows nothing is the failure this feature is
 * most likely to have.
 */
import { calls, expect, gotoTab, openUnlocked, test, undo } from "../helpers";

const READING = {
  id: "reading",
  tab: "life",
  title: "Reading",
  column: 3,
  configure: true,
  source: { endpoint: "/learning" },
  blocks: [{ type: "rows", idPrefix: "reading", bind: "learning.rows" }],
  version: 1,
  state: "proposed",
  managedBy: "ea",
  changedAt: "2026-09-01T09:00:00.000Z",
};

const REASON = "You open Learning most mornings; this puts it where you look first.";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function propose(page: import("@playwright/test").Page, config: unknown = READING, reason = REASON) {
  await page.evaluate(([c, r]) => (window as any).__JSTACK__.proposeSection(c, r), [config, reason] as const);
}

/** the same call, expecting the server to refuse it — returns the reason. */
async function proposeRefused(page: import("@playwright/test").Page, config: unknown = READING, reason = REASON) {
  return page.evaluate(async ([c, r]) => {
    try {
      await (window as any).__JSTACK__.proposeSection(c, r);
      return "accepted";
    } catch (e) {
      return String((e as { reason?: string }).reason ?? e);
    }
  }, [config, reason] as const);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Needs you expands exactly ONE card and lists the rest as waiting rows, so
 * a proposal that ranks behind a clash arrives collapsed — correctly: a new
 * section is not more urgent than a calendar conflict. Open it to see the
 * card itself.
 */
async function openProposal(page: import("@playwright/test").Page, id = CARD) {
  const row = page.getByTestId(`waiting-open-${id}`);
  if (await row.count()) await row.click();
  await expect(page.getByTestId(`decision-card-${id}`)).toBeVisible();
}

const CARD = "sec-reading-1";

test.describe("CB-05 the proposal arrives as a card", () => {
  test("it previews the real blocks, carries its reason, and changes nothing yet", async ({ page }) => {
    await openUnlocked(page);
    await propose(page);

    // ux-review R1-05: the row's type label is ONE line in its fixed column.
    // "SECTION" is the widest label the catalogue can put there, and at the
    // pack's 48px it broke to "SECTIO / N" at every width, both schemes.
    const type = page.getByTestId(`waiting-type-${CARD}`);
    await expect(type).toHaveText(/section/i);
    const fit = await type.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const fontSize = parseFloat(getComputedStyle(el).fontSize);
      return { over: Math.max(0, el.scrollWidth - el.clientWidth), oneLine: r.height < 2 * fontSize };
    });
    expect(fit).toEqual({ over: 0, oneLine: true });

    await openProposal(page);
    const card = page.getByTestId(`decision-card-${CARD}`);
    await expect(card).toContainText("New section: Reading");
    await expect(card).toContainText("most mornings");

    // the preview is the section itself, with Josh's own rows in it
    const preview = page.getByTestId("decision-section-reading");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Multi-agent orchestration patterns");
    // the caption sits on the CARD, not inside the inset (ux-review B3R2-05):
    // 10.5 Muted is a card-or-ground size, and on the inset's own fill it
    // measured ~3.0:1 against the pack's 4.6.
    // ux S6-07: the source is a noun and the column number is gone — a reader
    // cannot see a column 3, and the preview already shows what goes where
    await expect(card).toContainText("goes on Life · reads Learning");
    await expect(card).not.toContainText("column 3");
    // ux S6-25: a preview is SAID to be one and wears the pack's Ghost dress,
    // not the fill of the button that approves it
    await expect(card).toContainText("a preview");
    const dress = await preview.evaluate((el) => ({ border: getComputedStyle(el).borderTopStyle, fill: getComputedStyle(el).backgroundColor }));
    expect(dress).toEqual({ border: "dashed", fill: "rgba(0, 0, 0, 0)" });

    // CB-10 / NC-01: nothing in a preview is tappable. A row verb inside an
    // un-approved section would be an action on a thing that does not exist.
    await expect(preview.locator("button")).toHaveCount(0);

    // and the tab is untouched until a verb says otherwise
    await gotoTab(page, "life");
    await expect(page.getByTestId("life-reading-section")).toHaveCount(0);
  });
});

test.describe("CB-06 approve, and undo", () => {
  test("approve renders it on Life and lists it in Arrange; undo takes it back", async ({ page }, testInfo) => {
    await openUnlocked(page);
    await propose(page);
    await openProposal(page);
    await page.getByTestId(`decision-primary-${CARD}`).click();

    await gotoTab(page, "life");
    await expect(page.getByTestId("life-reading-section")).toBeVisible();
    await expect(page.getByTestId("life-reading-section")).toContainText("Reading");

    if (testInfo.project.name !== "w393-light") {
      await page.getByTestId("header").getByLabel("Arrange").click();
      await expect(page.getByTestId("arrange-row-reading")).toBeVisible();
      await page.getByTestId("arrange-dialog-close").click();
    }

    const c = await calls(page);
    expect(c.some((x) => x.method === "postActionVerb")).toBe(true);
  });

  test("undo within the window removes the section again", async ({ page }) => {
    await openUnlocked(page);
    await propose(page);
    await openProposal(page);
    await page.getByTestId(`decision-primary-${CARD}`).click();
    await undo(page);

    await gotoTab(page, "life");
    await expect(page.getByTestId("life-reading-section")).toHaveCount(0);
    await gotoTab(page, "today");
    await expect(page.getByTestId(`waiting-row-${CARD}`).or(page.getByTestId(`decision-card-${CARD}`)).first()).toBeVisible();
  });
});

test.describe("CB-07 revise re-proposes", () => {
  test("the config opens prefilled; saving comes back as a new proposal", async ({ page }) => {
    await openUnlocked(page);
    await propose(page);
    await openProposal(page);

    await page.getByTestId(`decision-revise-${CARD}`).click();
    await expect(page.getByTestId("life-config")).toBeVisible();
    await expect(page.getByTestId("config-title")).toHaveValue("Reading");

    await page.getByTestId("config-title").fill("Reading list");
    await page.getByTestId("config-save").click();
    await expect(page.getByTestId("life-config")).toHaveCount(0);

    // the old card is answered and gone; the revision is back as version 2
    await expect(page.getByTestId(`decision-card-${CARD}`)).toHaveCount(0);
    await openProposal(page, "sec-reading-2");
    await expect(page.getByTestId("decision-card-sec-reading-2")).toContainText("Reading list");

    // and still nothing on the tab: a revision is a proposal, not an approval
    await gotoTab(page, "life");
    await expect(page.getByTestId("life-reading-section")).toHaveCount(0);
  });
});

test.describe("CB-08 never", () => {
  test("never retires the id and the section never appears", async ({ page }) => {
    await openUnlocked(page);
    await propose(page);
    await openProposal(page);

    await page.getByTestId(`decision-more-${CARD}`).click();
    await page.getByTestId(`decision-never-${CARD}`).click();

    await expect(page.getByTestId(`decision-card-${CARD}`)).toHaveCount(0);
    await expect(page.getByTestId(`waiting-row-${CARD}`)).toHaveCount(0);
    await gotoTab(page, "life");
    await expect(page.getByTestId("life-reading-section")).toHaveCount(0);

    // and proposing it again is refused BY THE SERVER rather than quietly
    // re-offered — a "never" that means "not this week" is worse than no
    // button at all. The refusal is the assertion; a card that never renders
    // would also pass if the EA had simply not tried.
    await gotoTab(page, "today");
    expect(await proposeRefused(page)).toContain("retired");
    await expect(page.getByTestId("decision-card-sec-reading-2")).toHaveCount(0);
    await expect(page.getByTestId("waiting-row-sec-reading-2")).toHaveCount(0);
  });
});

/**
 * Josh's A-0 row 2 (B3R2-08, B3R2-09): the config dialog keeps the pack's
 * 900 ceiling and puts its primary first, no narrower than its secondary.
 */
test.describe("B3R2-08/09 the config dialog's width and verb row", () => {
  test("no wider than 900, Save before Revert and at least as wide", async ({ page }, testInfo) => {
    await openUnlocked(page);
    await propose(page);
    await openProposal(page);
    await page.getByTestId(`decision-revise-${CARD}`).click();
    await expect(page.getByTestId("life-config")).toBeVisible();
    const dialog = await page.getByTestId("life-config").boundingBox();
    expect(dialog!.width).toBeLessThanOrEqual(900);
    if (testInfo.project.name !== "w393-light") expect(dialog!.width).toBeGreaterThanOrEqual(600);
    const save = await page.getByTestId("config-save").boundingBox();
    const revert = await page.getByTestId("config-revert").boundingBox();
    expect(save!.x).toBeLessThan(revert!.x);
    expect(save!.width).toBeGreaterThanOrEqual(revert!.width - 1);
  });
});
