/**
 * TK-01..07, TK-11, TK-13, TK-14, FS-02 (tasks half) — the Tasks tab:
 * segments, slicers, filter, list/board/gantt/done, waiting on.
 */
import { assertCleanConsole, calls, expect, expectUndoToast, gotoTab, openUnlocked, test, undo } from "../helpers";

async function openTasks(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "tasks");
  return log;
}

/** T-5: the rig route, driven through the app's own transport so the mock's
 * server event reaches the client exactly as it would from a real backend. */
async function setWork(page: import("@playwright/test").Page, taskId: string, state: string, step?: string) {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
  await page.evaluate(([id, st, sp]) => (window as any).__JSTACK__.setWork(id, st, sp), [taskId, state, step] as const);
}

test.describe("TK-01 segmented control and slicers", () => {
  test("List is the default, and the slicer row is on every view (F-1/TF-05)", async ({ page }) => {
    const log = await openTasks(page);
    await expect(page.getByTestId("task-seg").getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("task-slicers")).toBeVisible();

    // it used to be List-only, so the other three showed whatever the List had
    // last been narrowed to with no way to see it or change it (§4, A-56)
    for (const name of ["Board", "Gantt", "Done"]) {
      await page.getByTestId("task-seg").getByRole("tab", { name }).click();
      await expect(page.getByTestId("task-slicers")).toBeVisible();
      await expect(page.getByTestId("task-range")).toBeVisible();
    }
    assertCleanConsole(log);
  });
});

test.describe("TK-02 slicers narrow the list", () => {
  test("Waiting shows only the waiting fixtures and the adapter receives ?slice=", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-slicers").getByText("Waiting", { exact: true }).click();
    await expect(page.getByTestId("task-list")).toContainText("Villa contract from Steve");
    await expect(page.getByTestId("task-list")).toContainText("Dev allocation from Andy");
    await expect(page.getByTestId("task-list")).not.toContainText("Send Moz the sample pack");

    const c = await calls(page);
    const last = [...c].reverse().find((x) => x.method === "getTasks");
    expect(last?.args).toContainEqual(expect.objectContaining({ slice: "waiting" }));
  });

  test("Delegated shows EA/subtask rows; Agent shows EA-owned; Recurring shows repeat rows", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-slicers").getByText("Delegated", { exact: true }).click();
    await expect(page.getByTestId("task-list")).toContainText("Redact the 200 sample emails");

    await page.getByTestId("task-slicers").getByText("Agent", { exact: true }).click();
    await expect(page.getByTestId("task-list")).toContainText("Redact the 200 sample emails");
    await expect(page.getByTestId("task-list")).not.toContainText("Send Moz the sample pack");

    await page.getByTestId("task-slicers").getByText("Recurring", { exact: true }).click();
    await expect(page.getByTestId("task-list")).toContainText("Waiting-on digest");
    await expect(page.getByTestId("task-list")).toContainText("Three workouts");
  });
});

test.describe("TK-03 owner marks", () => {
  test("EA rows get a dashed checkbox and an EA tag; Joce's get a JM tag; Josh's carry none", async ({ page }) => {
    await openTasks(page);
    await expect(page.getByTestId("task-tag-t2")).toHaveText("EA");
    // JQ-4 (A-67, via §4): Joce wears her own two letters now, not the "J"
    // she used to share with Josh.
    await expect(page.getByTestId("task-tag-t3")).toHaveText("JM");
    await expect(page.getByTestId("task-tag-t1")).toHaveCount(0);
  });
});

test.describe("TK-04 checkbox marks done", () => {
  test("the tick completes with undo; undo reopens", async ({ page }) => {
    await openTasks(page);
    // T-3: t1 has open subtasks, so the tick ASKS first (TK-10) and the toast
    // reads "Completed" rather than "Done" — one completion, one word for it,
    // whether it closed one thing or four (§4).
    await page.getByTestId("task-cb-t1").click();
    await page.getByTestId("complete-confirm-yes").click();
    await expectUndoToast(page, "Completed");
    await expect(page.getByTestId("task-row-t1")).toHaveCount(0); // left the (open-only) list view

    await undo(page);
    await expect(page.getByTestId("task-row-t1")).toBeVisible();
  });
});

test.describe("TK-05 Board", () => {
  test("Twenty's columns with fixture counts; a card opens the task", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    // a lane's header is its name and its count as TWO things — the pack's
    // Marker badge beside a section label (S6-20; B-77 moved Find's pin the
    // same way). It read "Now · 1" until Stage 6's ux round.
    const header = (lane: string) => page.getByTestId(`board-lane-${lane}`).locator("xpath=./div[1]");
    await expect(header("col-now")).toHaveText(/^Now\s*1$/);
    await expect(header("col-waiting")).toHaveText(/^Waiting\s*2$/);
    await expect(header("col-done")).toHaveText(/^Done\s*2$/);
    // B-1: the fifth lane. `in_progress` had no column at all, so the task the
    // EA was actively working sat in Next beside things nobody had started
    // (§4, BD-01).
    await expect(header("col-in-progress")).toHaveText(/^In progress\s*1$/);

    await page.getByTestId("board-card-t1").click();
    await expect
      .poll(async () => (await page.evaluate(() => (window as unknown as { __JSTACK__: { stores: { taskCard: () => { openTaskId: string | null } } } }).__JSTACK__.stores.taskCard().openTaskId)))
      .toBe("t1");
  });
});

test.describe("TK-06 Gantt", () => {
  test("bars per project render, an EA bar is dashed, tapping opens the task, footer links out", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    // the full Gantt (col 1) and Waiting on's mini Gantt (col 2) both
    // render bars for the same tasks at once — scope to the full one.
    const fullGantt = page.getByTestId("task-views").getByTestId("gantt");
    await expect(fullGantt.getByTestId("gantt-bar-t1")).toBeVisible();
    await expect(fullGantt.getByTestId("gantt-bar-t2")).toBeVisible();
    // G-1 (A-62, via §4): ADR-46 makes the bars draggable, so "Bar dates come
    // from Twenty." stopped being true. GT-04 in `gantt.spec.ts` is the gate
    // that keeps the replacement honest.
    await expect(fullGantt).toContainText("Drag a bar to change its dates.");

    await fullGantt.getByTestId("gantt-open-twenty").click();
    await expect(page.getByTestId("external-link-dialog")).toBeVisible();
    await page.getByTestId("external-link-cancel").click();
  });
});

test.describe("TK-07 Done search", () => {
  test("filters done rows; 'No matches.' when none; EA meta/cost is kept", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-seg").getByRole("tab", { name: "Done" }).click();
    await expect(page.getByTestId("done-search")).toContainText("Notion export reconciled");
    await expect(page.getByTestId("done-search")).toContainText("$0.03");

    await page.getByTestId("done-search-input").fill("dentist");
    await expect(page.getByTestId("done-search")).toContainText("Book dentist");
    await expect(page.getByTestId("done-search")).not.toContainText("Notion export reconciled");

    await page.getByTestId("done-search-input").fill("zzz-nothing-matches");
    await expect(page.getByTestId("done-search")).toContainText("No matches.");
  });
});

test.describe("TK-11 Waiting on", () => {
  test("nudge posts and toasts the fixed copy", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("nudge-t11").click();
    await expect(page.getByTestId("toast")).toContainText("Nudge drafted · in Gmail Drafts · never sends itself");
  });
});

test.describe("TK-13 recurring rows", () => {
  test("show the rule and last-run cost", async ({ page }) => {
    await openTasks(page);
    await expect(page.getByTestId("task-row-t4")).toContainText("every Mon 8am");
  });
});

test.describe("TK-14 Filter dialog", () => {
  test("multi-select composes with the slicer; applied chips remove; Clear all resets", async ({ page }) => {
    await openTasks(page);
    await page.getByLabel("Filter").click();
    await expect(page.getByTestId("filter-dialog")).toBeVisible();

    await page.getByTestId("filter-priority-high").click();
    await page.getByTestId("filter-apply").click();
    await expect(page.getByTestId("task-list")).toContainText("Send Moz the sample pack");
    await expect(page.getByTestId("task-list")).not.toContainText("Waiting-on digest"); // priority: low

    await page.getByLabel("Filter").click();
    // F-1/TF-03: the chip says the WORD now, not the wire value (§4, A-58)
    await expect(page.getByTestId("filter-applied-chips")).toContainText("High");
    await page.getByTestId("filter-clear").click();
    await expect(page.getByTestId("task-list")).toContainText("Waiting-on digest");
  });
});

test.describe("FS-02 focus (tasks half)", () => {
  test("selecting Work sends ?focus=work and narrows the list", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("focus-chips").getByText("Work", { exact: true }).click();
    await expect
      .poll(async () => (await calls(page)).some((c) => c.method === "getTasks" && c.args.some((a) => typeof a === "object" && a != null && (a as { focus?: string }).focus === "work")))
      .toBe(true);
    await expect(page.getByTestId("task-list")).not.toContainText("Book the Term 4 holiday flights"); // family
  });
});

/**
 * WK-02/WK-03 (T-5, ADR-42) — the agent working marker.
 *
 * The claims a unit test cannot make: the pulse is really animating, the same
 * marker is on the row, the board card and the Gantt bar, and flipping the
 * state on the SERVER moves all three without anybody reloading.
 */
test.describe("WK-02 the working marker", () => {
  test("the row says what the EA is doing and since when, and the 8px dot is pulsing", async ({ page }) => {
    const log = await openTasks(page);
    const mark = page.getByTestId("work-mark-t2");
    await expect(mark).toContainText(/^EA working · since \d{1,2}:\d{2}(am|pm)$/);
    await expect(mark).toHaveAttribute("data-work-state", "running");
    await expect(page.getByTestId("work-pulse-t2")).toHaveAttribute("data-animating", "on");
    assertCleanConsole(log);
  });

  test("the card carries the same line as the row", async ({ page }) => {
    await openTasks(page);
    const onRow = await page.getByTestId("work-mark-t2").innerText();
    await page.getByTestId("task-open-t2").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect(page.getByTestId("task-detail").getByTestId("work-mark-t2")).toHaveText(onRow);
  });

  test("queued and blocked are not 'working', and blocked names the step", async ({ page }) => {
    await openTasks(page);
    await setWork(page, "t2", "queued");
    await expect(page.getByTestId("work-mark-t2")).toHaveText("EA · queued");
    // a queued agent is not doing anything, so nothing pulses
    await expect(page.getByTestId("work-pulse-t2")).toHaveCount(0);

    await setWork(page, "t2", "blocked", "waiting on Dropbox");
    await expect(page.getByTestId("work-mark-t2")).toHaveText("EA · blocked · waiting on Dropbox");
  });
});

test.describe("WK-03 the same marker on all three surfaces, following the server", () => {
  test("board card and Gantt bar carry it, and /__test__/work moves all three without a reload", async ({ page }) => {
    await openTasks(page);
    await expect(page.getByTestId("work-mark-t2")).toContainText("EA working");

    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    await expect(page.getByTestId("board-card-t2").getByTestId("work-mark-t2")).toContainText("EA working");
    // the event, not a reload: the state changes on the server and the board
    // follows because `serverEvents` reloads tasks (WK-03)
    await setWork(page, "t2", "blocked", "waiting on Dropbox");
    await expect(page.getByTestId("board-card-t2").getByTestId("work-mark-t2")).toHaveText("EA · blocked · waiting on Dropbox");

    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    await expect(page.getByTestId("work-mark-t2")).toContainText("EA · blocked");

    // and when the run ends the marker goes, everywhere
    await setWork(page, "t2", "done");
    await expect(page.getByTestId("work-mark-t2")).toHaveCount(0);
  });
});

/**
 * TF-01..TF-08 (F-1, ADR-44) — one filter model for List, Board, Gantt and
 * Done.
 *
 * The claim that matters most is TF-08's: the same focus and the same slicer
 * show the same tasks on every view. That could not be true before, because the
 * Gantt fetched its own payload from a route that ignored both.
 */
test.describe("TF-01/TF-02 the range chip", () => {
  test("is the first chip, reads the parameter back, and is 'All time' on Done", async ({ page }) => {
    const log = await openTasks(page);
    await expect(page.getByTestId("task-range")).toContainText("Next 90 days");

    await page.getByTestId("task-seg").getByRole("tab", { name: "Done" }).click();
    // Josh, 7 Sep: Done shows everything (resolution #45)
    await expect(page.getByTestId("task-range")).toContainText("All time");
    assertCleanConsole(log);
  });

  test("the presets apply and the label follows; a custom window says its dates", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-range").click();
    await expect(page.getByTestId("range-dialog")).toBeVisible();

    await page.getByTestId("range-preset-thisWeek").click();
    await expect(page.getByTestId("task-range")).toContainText("This week");

    await page.getByTestId("task-range").click();
    await page.getByTestId("range-preset-custom").click();
    await expect(page.getByTestId("range-custom")).toBeVisible();
    await page.getByTestId("range-from").click();
    // the 11th of whichever month the picker opens on — a day, not an instant
    await page.getByTestId("range-from-panel").getByLabel(/-11$/).first().click();
    await page.getByTestId("range-apply").click();
    await expect(page.getByTestId("task-range")).toContainText("From 11");
  });
});

test.describe("TF-03/TF-04 the panel says names, and the list says what is on", () => {
  test("owners read as people and agents; statuses read as words; the chips remove", async ({ page }) => {
    const log = await openTasks(page);
    await page.getByTestId("task-filter-open").click();
    await expect(page.getByTestId("filter-dialog")).toBeVisible();
    // never `in_progress`, never a bare `ea`
    await expect(page.getByTestId("filter-status-in_progress")).toContainText("In progress");
    await expect(page.getByTestId("filter-owner-ea")).toContainText("EA");
    await expect(page.getByTestId("filter-owner-josh")).toContainText("Josh");

    await page.getByTestId("filter-status-in_progress").click();
    await page.getByTestId("filter-apply").click();

    // TF-04: with the panel closed, the list still says what is narrowing it
    await expect(page.getByTestId("active-filter-status-in_progress")).toContainText("In progress");
    await expect(page.getByTestId("task-filter-open-badge")).toHaveText("1");

    // one tap removes it
    await page.getByTestId("active-filter-status-in_progress").click();
    await expect(page.getByTestId("task-active-filters")).toHaveCount(0);
    assertCleanConsole(log);
  });
});

test.describe("TF-07 Clear", () => {
  test("appears only when something is on, and one tap resets all three", async ({ page }) => {
    await openTasks(page);
    await expect(page.getByTestId("task-clear")).toHaveCount(0);

    await page.getByTestId("slicer-waiting").click();
    await page.getByTestId("task-range").click();
    await page.getByTestId("range-preset-all").click();
    await expect(page.getByTestId("task-clear")).toBeVisible();

    await page.getByTestId("task-clear").click();
    await expect(page.getByTestId("task-clear")).toHaveCount(0);
    await expect(page.getByTestId("task-range")).toContainText("Next 90 days");
    await expect(page.getByTestId("task-list")).toContainText("Send Moz the sample pack");
  });
});

test.describe("TF-06 the slicers are a list Josh edits", () => {
  test("a new slicer with a dueWithin predicate filters, and a fixed one cannot be removed", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("slicer-edit-open").click();
    await expect(page.getByTestId("slicer-edit-dialog")).toBeVisible();
    // `week` is fixed: no remove control at all
    await expect(page.getByTestId("slicer-remove-week")).toHaveCount(0);
    await expect(page.getByTestId("slicer-remove-agent")).toBeVisible();

    await page.getByTestId("slicer-add-open").click();
    await page.getByTestId("slicer-name").fill("Next fortnight");
    await page.getByTestId("slicer-kind-dueWithin").click();
    await page.getByTestId("slicer-days").fill("14");
    await page.getByTestId("slicer-save").click();

    const chip = page.getByTestId("task-slicers").getByText("Next fortnight", { exact: true });
    await expect(chip).toBeVisible();
    await chip.click();
    // t5 is due in six days, t3 in three — both inside a fortnight
    await expect(page.getByTestId("task-list")).toContainText("Passport renewal forms");
  });
});

test.describe("TF-08 one query, four views", () => {
  const shownIds = (page: import("@playwright/test").Page) =>
    page
      .locator("[data-testid^='task-row-'], [data-testid^='board-card-'], [data-testid^='gantt-bar-']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace(/^(task-row|board-card|gantt-bar)-/, "")).sort());

  test("a focus and a slicer show the same tasks on List, Board and Gantt", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("slicer-waiting").click();
    await expect(page.getByTestId("task-list")).toContainText("Villa contract from Steve");

    const list = await shownIds(page);
    expect(list.length).toBeGreaterThan(0);

    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    await expect(page.getByTestId("board-scroll")).toBeVisible();
    expect(await shownIds(page)).toEqual(list);

    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    await expect(page.getByTestId("gantt")).toBeVisible();
    // the Gantt draws only DATED tasks, so its ids are a subset of the same set
    for (const id of await shownIds(page)) expect(list).toContain(id);
  });

  test("GET /tasks/gantt no longer exists — the Gantt asks the same route the list does", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    await expect(page.getByTestId("gantt")).toBeVisible();

    const c = await calls(page);
    expect(c.some((x: { method: string }) => x.method === "getGantt")).toBe(false);
    const last = [...c].reverse().find((x: { method: string }) => x.method === "getTasks");
    expect(last?.args).toContainEqual(expect.objectContaining({ view: "gantt" }));
  });
});

/**
 * JQ-03 (Josh, 8 Sep) — every row says its priority, and the high one pops.
 *
 * The colours are read off the DOM and compared to ANOTHER run in the same
 * line, not to a hex written down here: what Josh asked for is a contrast
 * between the phrase and the rest of the meta, and that is the thing worth
 * asserting. A literal would pass on the day it was typed and go quiet the next
 * time the palette moved.
 */
test.describe("JQ-03 every task row says its priority", () => {
  test("every row carries one priority phrase, and 'high priority' is the only accented one", async ({ page }) => {
    await openTasks(page);
    const metas = await page
      .locator("[data-testid^='task-row-']")
      .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    expect(metas.length).toBeGreaterThan(3);
    for (const text of metas) {
      const hits = ["high priority", "medium priority", "low priority"].filter((p) => text.includes(p));
      expect({ text: text.slice(0, 60), hits: hits.length }).toEqual({ text: text.slice(0, 60), hits: 1 });
    }

    // the accented phrase is a different colour from the meta text beside it
    const accent = page.locator("[data-testid^='task-priority-']").first();
    await expect(accent).toHaveText("high priority");
    const phraseColour = await accent.evaluate((el) => getComputedStyle(el).color);
    const metaColour = await page.getByTestId("task-footer").evaluate((el) => getComputedStyle(el).color);
    expect(phraseColour).not.toBe(metaColour);
  });
});

/**
 * JQ-04 (Josh, 8 Sep) — "owners are not 'J Josh' and 'J Joce'. That's dumb.
 * Make it Josh (abbreviated to JO) and Joce (abbreviated to JM)."
 */
test.describe("JQ-04 people carry their own abbreviation", () => {
  test("no owner mark is a bare J, and Joce reads JM", async ({ page }) => {
    await openTasks(page);
    const marks = await page.locator("[data-testid^='task-tag-']").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect(marks.length).toBeGreaterThan(0);
    // the complaint, stated as an assertion: nobody wears a lone J
    expect(marks.filter((m) => m === "J")).toEqual([]);
    // t3 is Joce's
    await expect(page.getByTestId("task-tag-t3")).toHaveText("JM");
  });
});

/**
 * Stage 6 A-3 — what the device pass measured on the Tasks tab (ux round
 * S6-10, S6-14, S6-23, S6-24).
 */
async function boxOf(page: import("@playwright/test").Page, testId: string) {
  const b = await page.getByTestId(testId).boundingBox();
  if (b == null) throw new Error(`${testId} has no box`);
  return b;
}

test.describe("TK-12 a Done row says when it was finished, and by whom (S6-10)", () => {
  test("the Done tab's row and the board's Done lane both carry 'Completed · EA · <when>' for the EA's finished task", async ({ page }) => {
    await openTasks(page);
    await page.getByTestId("task-seg").getByRole("tab", { name: "Done" }).click();
    // t9 finished yesterday at 2:14am, by the EA — `formatWhen`'s words, no instant (TK-13)
    await expect(page.getByTestId("task-open-t9")).toContainText("Completed · EA · Yesterday 2:14am");
    // and Josh's own finished task names him
    await expect(page.getByTestId("task-open-t10")).toContainText("Completed · Josh · Yesterday 8:10am");

    await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
    await expect(page.getByTestId("board-meta-t9")).toContainText("Completed · EA · Yesterday 2:14am");
  });
});

test.describe("S6-14 the title column starts at one x whether or not the row wears an owner mark", () => {
  test("Josh's own row and the EA's row start their titles on the same x", async ({ page }) => {
    await openTasks(page);
    // t1 is Josh's (no mark); t2 is the EA's (an EA tag). The pass measured
    // 268.7 against 306.1 — 37px of travel, four times down one card.
    const bare = await boxOf(page, "task-open-t1");
    const marked = await boxOf(page, "task-open-t2");
    expect(Math.round(bare.x)).toBe(Math.round(marked.x));
  });
});

test.describe("S6-23 Done says why its range chip reads differently", () => {
  test("the hint sits in the slicer row on Done while the range is the default, and nowhere else", async ({ page }) => {
    await openTasks(page);
    await expect(page.getByTestId("task-range")).toContainText("Next 90 days");
    await expect(page.getByTestId("task-range-hint")).toHaveCount(0);

    await page.getByTestId("task-seg").getByRole("tab", { name: "Done" }).click();
    await expect(page.getByTestId("task-range")).toContainText("All time");
    const hint = page.getByTestId("task-slicers").getByTestId("task-range-hint");
    await expect(hint).toHaveText("Done defaults to all time");

    // an explicit preset is the same on every view (TF-01), so there is
    // nothing left to explain
    await page.getByTestId("task-range").click();
    await page.getByTestId("range-preset-thisWeek").click();
    await expect(page.getByTestId("task-range")).toContainText("This week");
    await expect(page.getByTestId("task-range-hint")).toHaveCount(0);
  });
});

test.describe("S6-24 the compact Gantt is a glance you can read", () => {
  test("its track is dated at both ends and no bar is a speck", async ({ page }) => {
    await openTasks(page);
    // S6-42 (B-163) made the compact card a section of its own beside Waiting
    // on, so the locator follows it: the card sits under its own label
    const mini = page.getByTestId("gantt-mini-label").locator("..").getByTestId("gantt");
    await expect(mini).toBeVisible();
    const date = /^\d{1,2} [A-Z][a-z]{2}$/;
    await expect(mini.getByTestId("gantt-mini-from")).toHaveText(date);
    await expect(mini.getByTestId("gantt-mini-to")).toHaveText(date);

    // the pass measured 3px bars on a 308px track: a one-day task at 90 days
    // to the track. The bar is the track's child's child.
    const bar = mini.getByTestId("gantt-bar-t1").locator(":scope > div > div").first();
    await expect(bar).toBeVisible();
    const width = await bar.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(6);
  });
});
