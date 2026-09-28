/** LF-01..10, TD-06 (glance ↔ life), FS-02 (life half), UN-03 (habit half). */
import { calls, expect, expectUndoToast, gotoTab, openUnlocked, pickProject, test, undo } from "../helpers";

async function openLife(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "life");
  return log;
}

test.describe("LF-07 the configure link", () => {
  test("every EA-managed config record carries it — Learning included", async ({ page }) => {
    // ux-review R1-11: People, Money and Health showed "configure" and
    // Learning did not, so the one record without the link read as a
    // component. The fixture had simply never set `configure` on it.
    await openLife(page);
    for (const id of ["people", "money", "learning", "health"]) {
      await expect(page.getByTestId(`${id}-configure`), id).toBeVisible();
    }
  });
});

/** The goal ROWS, and only them. LG-1 gave each row a `goal-meta-<id>` child
 * and the section header two links, so a bare `^="goal-"` now counts the metas
 * as rows as well — the LF-08 shape, where the claim ("three rows") never
 * changed and the SELECTOR reached its subject by a prefix something new
 * shares. Named rather than relaxed. */
const goalRows = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid="life-goals-section"] [data-testid^="goal-"]:not([data-testid^="goal-meta-"])');

test.describe("LF-01 Goals", () => {
  test("three rows, name at 500, behind in accent ink", async ({ page }) => {
    await openLife(page);
    await expect(goalRows(page)).toHaveCount(3);
    // §4 (LG-05): the status line is composed by the APP now — the server
    // sends the enum and the KPI, so the row says what 2 is out of.
    await expect(page.getByTestId("goal-meta-g3")).toHaveText("behind · 2 of 3 this week");
  });
});

test.describe("LG-01 the goal editor", () => {
  test("edit opens the list, saving PUTs the set, and the section updates", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goals-edit").click();
    await expect(page.getByTestId("goal-edit-dialog")).toBeVisible();

    await page.getByTestId("goal-edit-open-g1").click();
    await page.getByTestId("goal-text").fill("decide on Bundaberg by October");
    await page.getByTestId("goal-save").click();

    const c = await calls(page);
    expect(c.some((x) => x.method === "putGoals")).toBe(true);
    await expect(page.getByTestId("goal-g1")).toContainText("decide on Bundaberg by October");
  });

  test("a new goal is added from the same dialog and appears on the card", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goals-edit").click();
    await page.getByTestId("goal-add-open").click();
    await page.getByTestId("goal-area").fill("Practice");
    await page.getByTestId("goal-text").fill("second clinic room fitted out");
    await page.getByTestId("goal-save").click();

    await expect(goalRows(page)).toHaveCount(4);
    await expect(page.getByTestId("life-goals-section")).toContainText("second clinic room fitted out");
  });

  test("Save refuses a goal with no text, and says why", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goals-edit").click();
    await page.getByTestId("goal-add-open").click();
    await page.getByTestId("goal-area").fill("Practice");

    // `BtnPrimary`'s contract is a disabled button that SAYS WHY, never a dead
    // one — so the claim is the reason, not a toast. Asserted as the attribute
    // because a native-renderer test sees the prop and never the DOM (B-10).
    const save = page.getByTestId("goal-save");
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(save).toHaveAttribute("data-disabled-reason", "Give it a title");
    await expect(page.getByTestId("goal-form")).toBeVisible();

    // and the same button saves the moment the reason is gone
    await page.getByTestId("goal-text").fill("second clinic room fitted out");
    await expect(save).toHaveAttribute("aria-disabled", "false");
    await save.click();
    await expect(page.getByTestId("life-goals-section")).toContainText("second clinic room fitted out");
  });
});

test.describe("LG-02 the goal detail", () => {
  test("opens with its tasks, deliverables and KPIs", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goal-g2").click();
    await expect(page.getByTestId("goal")).toBeVisible();
    await expect(page.getByTestId("goal-title")).toContainText("V2 live, Notion retired");

    // KPIs as stats — value OF target, with the unit when it has one
    await expect(page.getByTestId("goal-kpis")).toContainText("12 of 18");
    // the linked task, opening its card
    await expect(page.getByTestId("goal-tasks")).toContainText("Notion export reconciled");
    // the deliverable, which is an Attachment (X-1's table)
    await expect(page.getByTestId("goal-deliverables")).toContainText("export.csv");
  });

  test("a task row opens the task card", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goal-g2").click();
    await page.getByTestId("goal-task-t9").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
  });
});

test.describe("LG-03 tasks from a goal", () => {
  test("Add task creates one with goalId and opens its card, which shows the goal", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goal-g2").click();
    await page.getByTestId("goal-add-task").click();
    await page.getByTestId("goal-new-task-title").fill("Write the migration note");
    await page.getByTestId("goal-new-task-save").click();

    const c = await calls(page);
    const posted = c.find((x) => x.method === "postTask");
    expect(posted).toBeDefined();
    // `apiCalls` logs [path, body] (ApiAdapter.request), so the body is args[1]
    expect(posted!.args[0]).toBe("/tasks");
    expect((posted!.args[1] as { goalId?: string }).goalId).toBe("g2");

    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect(page.getByTestId("task-goal-chip")).toContainText("V2 live, Notion retired");
  });

  test("Add subtask picks one of the goal's tasks, then lands on its subtask field", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goal-g2").click();
    await page.getByTestId("goal-add-subtask").click();
    // the picker is the goal's own tasks — there is no subtask field without
    // a task to hang it on
    await expect(page.getByTestId("goal-pick-task-t9")).toBeVisible();
    await page.getByTestId("goal-pick-task-t9").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect(page.getByTestId("subtask-input")).toBeVisible();
  });
});

test.describe("LG-04 archive, history, and what Brain is told", () => {
  test("Done archives the goal, All goals lists it read-only, and Latest in says so", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goal-g3").click();
    await page.getByTestId("goal-done").click();

    // off the card
    await expect(goalRows(page)).toHaveCount(2);

    // in the archive, and read-only there
    await page.getByTestId("goals-all").click();
    await expect(page.getByTestId("goals-all-rows")).toContainText("three workouts a week");
    await page.getByTestId("goals-all-row-g3").click();
    await expect(page.getByTestId("goal-title")).toContainText("three workouts a week");
    await expect(page.getByTestId("goal-done")).toHaveCount(0);
    await expect(page.getByTestId("goal-history")).toContainText("done");

    // and Brain was told
    await page.getByTestId("goal-close").click();
    await gotoTab(page, "brain");
    await expect(page.getByTestId("latest-in")).toContainText("Goal archived · three workouts a week");
  });

  test("Drop archives it the same way", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goal-g1").click();
    await page.getByTestId("goal-drop").click();
    await expect(goalRows(page)).toHaveCount(2);
    await page.getByTestId("goals-all").click();
    await expect(page.getByTestId("goals-all-rows")).toContainText("decide on Bundaberg");
  });

  test("the archive searches over history", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("goals-all").click();
    // g4 is the fixture's already-archived goal
    await expect(page.getByTestId("goals-all-rows")).toContainText("hire a second coach");
    await page.getByTestId("goals-all-search").fill("nothing matches this");
    await expect(page.getByTestId("goals-all-rows")).toContainText("No matches.");
  });
});

test.describe("LF-02 Habits", () => {
  test("nine chips toggle via POST /habits/{id}/log and stay in step with Today", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("life-habit-h2")).toHaveAttribute("aria-selected", "false");
    await page.getByTestId("life-habit-h2").click();
    await expect(page.getByTestId("life-habit-h2")).toHaveAttribute("aria-selected", "true");

    const c = await calls(page);
    expect(c.some((x) => x.method === "postHabitLog")).toBe(true);

    await gotoTab(page, "today");
    await expect(page.getByTestId("glance-habits")).toContainText("5/9");
    await expect(page.getByTestId("close-habit-h2")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("UN-03 habit toggle offers undo", () => {
  test("toggling a habit shows the undo toast; Undo reverts it through the adapter", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("life-habit-h4")).toHaveAttribute("aria-selected", "false");
    await page.getByTestId("life-habit-h4").click();
    await expect(page.getByTestId("life-habit-h4")).toHaveAttribute("aria-selected", "true");
    await expectUndoToast(page, "Done");

    await undo(page);
    await expect(page.getByTestId("life-habit-h4")).toHaveAttribute("aria-selected", "false");
    const c = await calls(page);
    expect(c.filter((x) => x.method === "postHabitLog").length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("LF-03 Trends", () => {
  test("period tabs call GET /habits/stats; the summary line follows", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("habits-trends").click();
    await expect(page.getByTestId("trends-dialog")).toBeVisible();
    await expect(page.getByTestId("trends-summary")).toContainText("This week");

    await page.getByTestId("trends-period").getByRole("tab", { name: "Month" }).click();
    await expect(page.getByTestId("trends-summary")).toContainText("This month");
    const c = await calls(page);
    expect(c.filter((x) => x.method === "getHabitStats").length).toBeGreaterThanOrEqual(2);
  });
});

async function openTrends(page: import("@playwright/test").Page, tab: "Week" | "Month" | "Year" | "All time") {
  await openLife(page);
  await page.getByTestId("habits-trends").click();
  await expect(page.getByTestId("trends-dialog")).toBeVisible();
  if (tab !== "Week") await page.getByTestId("trends-period").getByRole("tab", { name: tab }).click();
}

test.describe("LH-02 the month grid", () => {
  test("opens on the current month, one grid per habit, with day numbers and a count", async ({ page }) => {
    await openTrends(page, "Month");

    // the caption is THIS month — the view opens where the person is
    const now = new Date();
    const month = now.toLocaleString("en-AU", { month: "long", timeZone: "Australia/Brisbane" });
    await expect(page.getByTestId("habit-month-caption")).toContainText(month);

    // nine habits, nine grids. Named exactly rather than by prefix: every DAY
    // in every grid shares `habit-month-h…`, which is 279 elements — the LF-08
    // shape, hit while writing the test that would have hit it in review.
    for (const id of ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9"]) {
      await expect(page.getByTestId(`habit-month-${id}`), id).toBeVisible();
    }

    // the 1st of this month is drawn and carries its number
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    await expect(page.getByTestId(`habit-month-h1-${first}`)).toBeVisible();
    await expect(page.getByTestId(`habit-month-h1-${first}`)).toHaveText("1");

    // "18 of 30" — counted over days that have happened
    await expect(page.getByTestId("habit-month-count-h1")).toHaveText(/^\d+ of \d+$/);
  });

  test("the arrows page it, and the forward one is bounded by today", async ({ page }) => {
    await openTrends(page, "Month");
    const caption = await page.getByTestId("habit-month-caption").textContent();

    // forward from the current month is refused, with a reason rather than a
    // dead control (BtnPrimary/IconBtn's contract)
    await expect(page.getByTestId("habit-month-next")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("habit-month-next")).toHaveAttribute("data-disabled-reason", "This is the current month");

    await page.getByTestId("habit-month-prev").click();
    await expect(page.getByTestId("habit-month-caption")).not.toHaveText(caption ?? "");
    // and now forward works, back to where it started
    await expect(page.getByTestId("habit-month-next")).toHaveAttribute("aria-disabled", "false");
    await page.getByTestId("habit-month-next").click();
    await expect(page.getByTestId("habit-month-caption")).toHaveText(caption ?? "");
  });
});

test.describe("LH-03 the year grid", () => {
  test("opens on the current year with the weeks grid and twelve numbered bars", async ({ page }) => {
    await openTrends(page, "Year");
    const year = String(new Date().getFullYear());
    await expect(page.getByTestId("habit-year-caption")).toHaveText(year);

    await expect(page.getByTestId("habit-year-h1")).toBeVisible();
    // twelve bars, each with its count above it
    await expect(page.locator('[data-testid^="habit-year-bar-h1-"]')).toHaveCount(12);
    await expect(page.getByTestId(`habit-year-bar-h1-${year}-01`)).toBeVisible();
    await expect(page.getByTestId(`habit-year-bar-h1-${year}-12`)).toBeVisible();

    // a day inside the year is drawn
    await expect(page.getByTestId(`habit-year-h1-${year}-06-15`)).toBeVisible();
  });

  test("the grid scrolls sideways rather than shrinking off the phone", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openTrends(page, "Year");
    const scroller = page.getByTestId("habit-year-scroll-h1");
    const overflows = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    // fifty-three columns do not fit a phone at any cell size worth drawing;
    // on a wide screen they may, and the claim there is only that nothing is cut
    if (width < 768) expect(overflows).toBe(true);
    const cut = await scroller.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.right > document.documentElement.clientWidth + 1;
    });
    expect(cut).toBe(false);
  });
});

test.describe("LH-04 all time", () => {
  test("a bar row per year with data, and the streak line", async ({ page }) => {
    await openTrends(page, "All time");
    const year = String(new Date().getFullYear());
    await expect(page.getByTestId("habit-all-h9")).toBeVisible();
    await expect(page.getByTestId(`habit-all-bar-h9-${year}`)).toBeVisible();

    // the line names both streaks, the count and the rate. h9's runs are pinned
    // in `tests/unit/habitStats.test.ts` from the fixture's own day string.
    await expect(page.getByTestId("habit-all-line-h9")).toHaveText(/^current streak 6 · longest 27 · \d+ of \d+ · \d+%$/);
  });
});

test.describe("LH-05 the week strip on the Life card", () => {
  test("seven days at every width, and only today's cell is the toggle", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("life-week-h1")).toBeVisible();

    // SEVEN, everywhere. Round 1 asked for the strip to lengthen with the
    // screen (LH1-06); it was made 7/14/28 by screen width and round 2 measured
    // 28 cells running 432px OUTSIDE the card at 1366, across two other
    // sections. This card is ~380px wide at every width above the phone because
    // it sits in one of three columns, so the length is a LAYOUT question and
    // not a number in a component. The count is pinned here so a later row
    // cannot lengthen it without meeting that question again.
    await expect(page.locator('[data-testid^="life-week-h1-day-"]')).toHaveCount(6);

    // and the strip stays inside its card at every width — the regression this
    // number exists to prevent
    const overflow = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="life-habits-section"]')!.getBoundingClientRect();
      const cells = Array.from(document.querySelectorAll('[data-testid^="life-week-"]'));
      return cells.some((el) => el.getBoundingClientRect().right > card.right + 1);
    });
    expect(overflow).toBe(false);
    await expect(page.getByTestId("life-habit-h1")).toHaveAttribute("aria-selected", "true");

    // and it still toggles, optimistically, with an undo — UN-03 unchanged
    await expect(page.getByTestId("life-habit-h2")).toHaveAttribute("aria-selected", "false");
    await page.getByTestId("life-habit-h2").click();
    await expect(page.getByTestId("life-habit-h2")).toHaveAttribute("aria-selected", "true");
    await expectUndoToast(page, "Done");

    // the two surfaces that read two different sources for one fact agree
    await gotoTab(page, "today");
    await expect(page.getByTestId("glance-habits")).toContainText("5/9");
    await expect(page.getByTestId("close-habit-h2")).toHaveAttribute("aria-selected", "true");
  });

  test("a past day is not pressable — you cannot change what you did on Tuesday", async ({ page }) => {
    await openLife(page);
    const past = page.locator('[data-testid^="life-week-h1-day-"]').first();
    await expect(past).toBeVisible();
    await expect(past).not.toHaveAttribute("role", "button");
  });
});

test.describe("LF-04 People", () => {
  test("verb posts /people/{id}/act; draft toasts 'never sends itself'", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("person-act-pe1").click();
    await expect(page.getByTestId("toast")).toContainText("Drafted · never sends itself");
    const c = await calls(page);
    expect(c.some((x) => x.method === "postPersonAct")).toBe(true);
  });
});

test.describe("LF-05/LF-06 Money", () => {
  test("over-budget track and amount go alert; the due line and feed note render", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("money-amount-m2")).toBeVisible();
    await expect(page.getByTestId("life-money-section")).toContainText("RACQ home insurance");
    await expect(page.getByTestId("life-money-section")).toContainText("feed: Redbark, V2.1");
  });
});

test.describe("LF-07 Health", () => {
  test("shows the ghost card while healthFeed is off", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("health-ghost")).toContainText("Next: skin check, 2 Oct.");
  });
});

test.describe("LF-08 Learning", () => {
  test("two rows with meta from GET /learning", async ({ page }) => {
    await openLife(page);
    // The rows are `learning-<id>` (layout/blocks.tsx). Three other things in
    // this section share the prefix and are not rows: the "configure" link
    // (`learning-configure`, R-22 / ux-review R1-11), each row's own open
    // button (`learning-act-<id>`, O-1's `open` verb), and — since LL-03 gave
    // the section an "all" (`layout/SectionHeaderRight.tsx`) — the section's
    // own verb link, `learning-verb`.
    //
    // WPG-1d: `02_ACCEPTANCE_TESTS_v2.md`'s LF-08 says "two rows", and
    // `QA_REPORT_v2.md` marks it PASS on that literal claim — WPG-1b bent the
    // claim to the fixture instead of the other way round, adding a third
    // item (`le3`) to make LL-03's "podcast finds the listen item" testable.
    // Fixed by giving the listen/podcast role to an EXISTING item (`le2`)
    // instead, so the row count stays exactly what LF-08 has always said.
    // The SELECTOR change (excluding `learning-verb`) stands: it is the
    // B-15/B-23 shape — name what a row is rather than relax the count for
    // something that shares the prefix by coincidence — and was never the
    // part that needed reverting.
    const rows = page.locator(
      '[data-testid="life-learning-section"] [data-testid^="learning-"]:not([data-testid="learning-configure"]):not([data-testid^="learning-act-"]):not([data-testid="learning-verb"])',
    );
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Multi-agent orchestration patterns");
  });
});

test.describe("LF-09 Configure", () => {
  test("Money configure saves a new threshold; Revert restores the EA's", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("money-configure").click();
    await expect(page.getByTestId("life-config")).toBeVisible();
    await page.getByTestId("config-threshold-Home").fill("5000");
    await page.getByTestId("config-save").click();
    await expect(page.getByTestId("life-config")).toHaveCount(0);

    await page.getByTestId("money-configure").click();
    await expect(page.getByTestId("config-threshold-Home")).toHaveValue("5000");
    await page.getByTestId("config-revert").click();
    await expect(page.getByTestId("life-config")).toHaveCount(0);

    await page.getByTestId("money-configure").click();
    await expect(page.getByTestId("config-threshold-Home")).toHaveValue("4000");
  });
});

test.describe("LF-10 Configure — the §4.10 record (B-2)", () => {
  test("editing the title saves through PUT /sections/{id}; Revert restores the EA's", async ({ page }) => {
    await openLife(page);
    // People, Money, Learning and Health have no component file: they are
    // config records rendered by SectionRenderer. This edits one AS a record
    // and watches the rendered section change — the whole point of B-2.
    await expect(page.getByTestId("life-money-section")).toContainText("Money");
    await page.getByTestId("money-configure").click();
    await expect(page.getByTestId("config-title")).toHaveValue("Money");

    await page.getByTestId("config-title").fill("Budget");
    await page.getByTestId("config-save").click();
    await expect(page.getByTestId("life-config")).toHaveCount(0);
    await expect(page.getByTestId("life-money-section")).toContainText("Budget");

    await page.getByTestId("money-configure").click();
    await page.getByTestId("config-revert").click();
    await expect(page.getByTestId("life-config")).toHaveCount(0);
    await expect(page.getByTestId("life-money-section")).toContainText("Money");
  });

  test("a bound block is listed with its data source and offers no text field", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("money-configure").click();
    // ADR-39: repointing a block at different data is a release, not a text
    // field, so a bound block is shown and named but never editable here.
    await expect(page.getByTestId("life-config")).toContainText("Budget tracks against their limits");
    await expect(page.getByTestId("config-block-0")).toHaveCount(0);
  });

  test("Health's ghost text IS editable — it is written in the config, not bound", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("health-configure").click();
    await page.getByTestId("config-block-0").fill("Skin check on 2 Oct. The rest arrives with the feed.");
    await page.getByTestId("config-save").click();
    await expect(page.getByTestId("life-config")).toHaveCount(0);
    await expect(page.getByTestId("health-ghost")).toContainText("The rest arrives with the feed.");
  });
});

test.describe("FS-02 focus (life half)", () => {
  test("selecting Work sends ?focus=work to Life's load", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("focus-chips").getByText("Work", { exact: true }).click();
    await expect
      .poll(async () => (await calls(page)).some((c) => c.method === "getLife" && c.args.some((a) => typeof a === "object" && a != null && (a as { focus?: string }).focus === "work")))
      .toBe(true);
  });
});

test.describe("LH-06 archiving a habit", () => {
  test("archive takes it off the Life list and off Today, and keeps its history", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("life-week-h4")).toBeVisible();

    await page.getByTestId("habits-edit").click();
    await expect(page.getByTestId("habit-edit-dialog")).toBeVisible();
    // the word is ARCHIVE, not remove — the data is retained and the copy says so
    await expect(page.getByTestId("habit-remove-h4")).toHaveText("archive");
    await page.getByTestId("habit-remove-h4").click();
    await expect(page.getByTestId("toast")).toContainText("Audiobook archived · its history is kept");

    // an archive SAVES AND STAYS on the list — the same shape the focus and
    // slicer editors have, because you may be putting several away
    await expect(page.getByTestId("habit-edit-dialog")).toBeVisible();
    await page.getByTestId("habit-edit-dialog-close").click();

    // gone from Life, and from the eight remaining habits' count on Today
    await expect(page.getByTestId("life-week-h4")).toHaveCount(0);
    await expect(page.getByTestId("life-week-h1")).toBeVisible();
    await gotoTab(page, "today");
    await expect(page.locator('[data-testid^="close-habit-"]')).toHaveCount(8);
    await expect(page.getByTestId("glance-habits")).toContainText("/8");
  });

  test("a habit can be renamed and reordered without touching its logs", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("habits-edit").click();
    await page.getByTestId("habit-edit-open-h4").click();
    await page.getByTestId("habit-name").fill("Listening");
    await page.getByTestId("habit-save").click();
    await expect(page.getByTestId("life-habits-section")).toContainText("Listening");

    // the strip is still seven cells: a rename is not a reset
    await expect(page.locator('[data-testid^="life-week-h4-day-"]')).toHaveCount(6);

    await page.getByTestId("habits-edit").click();
    // the first row cannot move up, and says why rather than sitting dead
    await expect(page.getByTestId("habit-up-h1")).toHaveAttribute("aria-disabled", "true");
    await page.getByTestId("habit-down-h1").click();
    await expect(page.getByTestId("toast")).toContainText("Order saved");
    const names = await page.getByTestId("habit-edit-dialog").locator('[data-testid^="habit-edit-row-"]').allInnerTexts();
    expect(names[0]).toContain("Burn");
    expect(names[1]).toContain("Exercise");
  });
});

test.describe("LH-07 bringing an archived habit back", () => {
  test("Add habit lists it first with how much history is waiting, and restoring returns both", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("habits-edit").click();
    await page.getByTestId("habit-remove-h4").click();
    await expect(page.getByTestId("toast")).toContainText("archived");
    await page.getByTestId("habit-add-open").click();

    // it is offered back, ABOVE the name field, with a real number
    await expect(page.getByTestId("habit-restore-h4")).toBeVisible();
    await expect(page.getByTestId("habit-restore-meta-h4")).toHaveText(/^Restore · keeps \d+ days of history$/);
    const promised = Number(/keeps (\d+) days/.exec((await page.getByTestId("habit-restore-meta-h4").textContent()) ?? "")![1]);
    expect(promised).toBeGreaterThan(0);

    await page.getByTestId("habit-restore-h4").click();
    await expect(page.getByTestId("toast")).toContainText("Audiobook restored");

    // back on the list, with its strip — the history came with it
    await expect(page.getByTestId("life-week-h4")).toBeVisible();
    await expect(page.locator('[data-testid^="life-week-h4-day-"]')).toHaveCount(6);

    // and the number it promised is the number Trends now shows for it
    await page.getByTestId("habits-trends").click();
    await page.getByTestId("trends-period").getByRole("tab", { name: "All time" }).click();
    await expect(page.getByTestId("habit-all-line-h4")).toContainText(`of ${promised} ·`);
  });

  test("with nothing archived, Add habit is just the form", async ({ page }) => {
    await openLife(page);
    await page.getByTestId("habits-edit").click();
    await page.getByTestId("habit-add-open").click();
    // no empty "Or bring one back" card — a heading over nothing is a claim
    await expect(page.getByTestId("habit-archived")).toHaveCount(0);
    await expect(page.getByTestId("habit-name")).toBeVisible();
  });
});

test.describe("LH-05 the habit rows carry the card's hairlines (LH1-09 — P-9)", () => {
  test("every row but the last draws a 1 px bottom border, like the People card beside it", async ({ page }) => {
    await openLife(page);
    await expect(page.getByTestId("life-week-h1")).toBeVisible();
    const borders = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="life-habit-row-"]')).map((r) => getComputedStyle(r).borderBottomWidth));
    expect(borders.length).toBeGreaterThan(1);
    expect(borders.slice(0, -1).every((b) => b === "1px")).toBe(true);
  });
});

/**
 * Stage 6 A-3 (S6-11) — the trends dialog holds still, the week tab is the
 * month's card grid, and the year card's two charts show the same months.
 */
test.describe("Stage 6 A-3 · the trends dialog", () => {
  test("the segmented control stays where it was across all four tabs", async ({ page }) => {
    await openTrends(page, "Week");
    const ys: number[] = [];
    for (const tab of ["Week", "Month", "Year", "All time"]) {
      await page.getByTestId("trends-period").getByRole("tab", { name: tab }).click();
      await expect(page.getByTestId("trends-summary")).toContainText(tab === "All time" ? "All time" : `This ${tab.toLowerCase()}`);
      ys.push((await page.getByTestId("trends-period").boundingBox())!.y);
    }
    for (const y of ys) expect(Math.abs(y - ys[0])).toBeLessThanOrEqual(1);
  });

  test("the week tab is a card grid: one card per habit, seven dated cells, today underlined, and no second toggle", async ({ page }) => {
    await openTrends(page, "Week");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
    await expect(page.getByTestId("trend-row-h1")).toBeVisible();
    await expect(page.locator('[data-testid^="trend-week-h1-"]:not([data-testid$="-today"])')).toHaveCount(7);
    await expect(page.getByTestId(`trend-week-h1-${today}`)).toHaveText(String(Number(today.slice(8, 10))));
    await expect(page.getByTestId(`trend-week-h1-${today}-today`)).toBeVisible();
    await expect(page.getByTestId("trends-dialog").getByTestId("life-habit-h1")).toHaveCount(0);
  });

  test("the year card's grid and bars share one scroller, opened with this week at its right edge", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openTrends(page, "Year");
    const scroller = page.getByTestId("habit-year-scroll-h1");
    await expect(scroller.getByTestId("habit-year-bars-h1")).toHaveCount(1);
    const year = String(new Date().getFullYear());
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
    const box = (await scroller.boundingBox())!;
    const inside = async (id: string) => {
      const b = (await page.getByTestId(id).boundingBox())!;
      return b.x >= box.x - 1 && b.x + b.width <= box.x + box.width + 1;
    };
    expect(await inside(`habit-year-h1-${today}`)).toBe(true);
    // the window ends at THIS week, not at the year's end: December's bar is
    // off to the right unless it is December
    if (width >= 768 && !today.startsWith(`${year}-12`)) expect(await inside(`habit-year-bar-h1-${year}-12`)).toBe(false);
  });
});
