/** TK-05 (Board), task detail (B-14 regression) — across all eight w×scheme projects. */
import { assertCleanConsole, expect, gotoTab, openUnlocked, pickProject, test } from "../helpers";

test.describe("Tasks renders clean at every width and theme", () => {
  test("List, Board and the task detail dialog all work", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "tasks");
    await expect(page.getByTestId("task-views")).toBeVisible();

    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    await expect(page.getByTestId("board")).toContainText("Now");

    await page.getByTestId("task-seg").getByRole("tab", { name: "List" }).click();
    await page.getByTestId("task-open-t1").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    // the dialog must cover the full viewport (BUGLOG_v2.md B-14) — its
    // close button must be reachable without another element (the page
    // content underneath) intercepting the click.
    await page.getByTestId("task-detail-close").click();
    await expect(page.getByTestId("task-detail")).toHaveCount(0);

    assertCleanConsole(log);
  });
});

/**
 * TK-01 / RL-04 — handoff.md, Tasks: "Task list card **spans two columns** at
 * 1180+" and "**Column 3:** Waiting on (2 rows with 'Draft a nudge'), Gantt
 * card". The row-21 device pass showed the opposite: the list card sat in
 * column 1 only, Waiting on + Gantt sat in column 2, and column 3 was a
 * 430px-wide empty void down the right of every Tasks view at 1920 — and at
 * 1366/1920 the Board's lanes overflowed column 1 and were painted over by
 * column 2 (ux-review D5 and D2, one cause).
 */
test.describe("TK-01/RL-04 the Tasks list spans two columns at 1180+", () => {
  test("the views card is wider than Waiting on, and nothing sits to the right of column 3", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width < 1180, "the two-column span is a 1180+ rule; narrower tiers stack");
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    const views = await page.getByTestId("task-views").boundingBox();
    const waiting = await page.getByTestId("waiting-on").boundingBox();
    expect(views).not.toBeNull();
    expect(waiting).not.toBeNull();
    // the list card spans columns 1+2, so it is far wider than the column-3 card
    expect(views!.width).toBeGreaterThan(waiting!.width * 1.9);
    // Waiting on is to the RIGHT of the list card, not beside it in column 2
    expect(waiting!.x).toBeGreaterThan(views!.x + views!.width - 4);
    // and the board stays inside the span rather than running under column 2.
    // Measured on the SCROLLER, not on `board`: the lane strip is content
    // inside a horizontal ScrollView and is MEANT to be wider than its
    // viewport (the mock's own `.board{overflow-x:auto}`) — it is the
    // scroller's box that must respect the column.
    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    const scroller = await page.getByTestId("board-scroll").boundingBox();
    expect(scroller!.x + scroller!.width).toBeLessThanOrEqual(views!.x + views!.width + 4);
  });

  test("board lanes are the mock's minmax(200px, 1fr): 200 when the strip overflows, equal shares when it fits", async ({ page }) => {
    // ux-review R1-03: inside a horizontal scroller `flex: 1` bounds nothing,
    // so each lane grew to its longest title on one line and the strip ran
    // off the column with words cut at the edge — "Redact the 200 sample emai".
    // Mock v11: `.board{grid-auto-columns:minmax(200px,1fr)}` — a lane is
    // 200 wide when four do not fit, and a quarter of the strip when they do;
    // either way a title wraps inside it.
    const log = await openUnlocked(page);
    await gotoTab(page, "tasks");
    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    const scroller = await page.getByTestId("board-scroll").boundingBox();
    expect(scroller).not.toBeNull();
    // B-1: the lanes are TWENTY'S COLUMNS now, so their count comes from the
    // server and their ids are `Column.id`s. The rule is unchanged — a lane is
    // 200 wide when they do not fit and an equal share when they do — but a
    // hard-coded four would have been this file deciding how many columns
    // Twenty has (§4, BD-01).
    const gap = 8; // space[3], the strip's gap
    const keys = await page.locator("[data-testid^='board-lane-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("board-lane-", "")));
    expect(keys.length).toBeGreaterThan(0);
    const n = keys.length;
    const fits = scroller!.width >= n * 200 + (n - 1) * gap;
    const want = fits ? (scroller!.width - (n - 1) * gap) / n : 200;
    for (const key of keys) {
      const lane = await page.getByTestId(`board-lane-${key}`).boundingBox();
      expect(lane, key).not.toBeNull();
      expect({ key, width: Math.round(lane!.width) }).toEqual({ key, width: Math.round(want) });
    }
    const cut = await page.locator('[data-testid^="board-card-"]').evaluateAll((cards) =>
      cards.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.getAttribute("data-testid")),
    );
    expect(cut).toEqual([]);
    assertCleanConsole(log);
  });
});
