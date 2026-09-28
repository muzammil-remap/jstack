/**
 * TK-08..10, TK-12, DC-08 (teach from a report) — the task detail
 * dialog: subtasks, delegate, the EA's report, activity, accept from
 * Joce.
 */
import { assertCleanConsole, db, expect, gotoTab, openUnlocked, pickProject, test } from "../helpers";

async function openTaskDetail(page: import("@playwright/test").Page, id: string, view: "list" | "done" = "list") {
  const log = await openUnlocked(page);
  await gotoTab(page, "tasks");
  if (view === "done") await page.getByTestId("task-seg").getByRole("tab", { name: "Done" }).click();
  await page.getByTestId(`task-open-${id}`).click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  return log;
}

test.describe("TK-08 task detail content", () => {
  test("title, meta with repeat, focus chip, the Twenty link, files, subtasks, activity", async ({ page }) => {
    const log = await openTaskDetail(page, "t4"); // recurring
    const dialog = page.getByTestId("task-detail");
    await expect(dialog).toContainText("Waiting-on digest");
    await expect(dialog).toContainText("repeat: every Mon 8am");
    await expect(page.getByTestId("task-focus-chip")).toBeVisible();
    await expect(page.getByTestId("task-link-twenty")).toBeVisible();
    // FL-06 (§4, A-89): the fabricated "Dropbox folder" button is gone. A
    // task's Dropbox links are its FILES now, each carrying the one the
    // backend indexed — asserted here so the removal is a positive claim
    // rather than a line quietly deleted.
    await expect(page.getByTestId("task-link-dropbox")).toHaveCount(0);
    await expect(dialog.getByTestId("task-files")).toBeVisible();
    assertCleanConsole(log);
  });

  test("subtasks show '2 of 3 done' with EA tags", async ({ page }) => {
    await openTaskDetail(page, "t1");
    const subtasks = page.getByTestId("subtasks");
    await expect(subtasks).toContainText("2 of 3 done");
    await expect(subtasks).toContainText("Pick three sample emails");
  });

  test("Twenty/Dropbox links open the external-link confirmation", async ({ page }) => {
    await openTaskDetail(page, "t1");
    await page.getByTestId("task-link-twenty").click();
    await expect(page.getByTestId("external-link-dialog")).toBeVisible();
    await page.getByTestId("external-link-cancel").click();
    await expect(page.getByTestId("external-link-dialog")).toHaveCount(0);
  });
});

test.describe("TK-09 add subtask and delegate", () => {
  test("'+ subtask' posts a titled subtask", async ({ page }) => {
    await openTaskDetail(page, "t1");
    await page.getByTestId("subtask-input").fill("Confirm shipping address");
    await page.getByLabel("Add subtask").click();
    await expect(page.getByTestId("subtasks")).toContainText("Confirm shipping address");
    await expect(page.getByTestId("subtasks")).toContainText("2 of 4 done"); // the new subtask starts undone
  });

  test("Delegate to the EA moves to an acknowledged state and adds an activity line", async ({ page }) => {
    await openTaskDetail(page, "t5"); // no delegation yet
    // T-2: the roster has two delegatees, so the verb opens the picker and the
    // default is one tap away. The claim below is unchanged.
    await page.getByTestId("task-delegate").click();
    await page.getByTestId("delegate-to-ea-pick").click();
    await expect(page.getByTestId("task-activity")).toContainText("Acknowledged");

    const state = await db(page);
    const t5 = state.tasks.find((t: { id: string }) => t.id === "t5");
    expect(t5.delegated).toMatchObject({ to: "ea", state: "acknowledged" });
  });
});

test.describe("TK-10 the EA's report", () => {
  test("title, quote, file chips, flagged count; Looks right / Revise / Teach", async ({ page }) => {
    await openTaskDetail(page, "t9", "done"); // t9 is already done
    const report = page.getByTestId("ea-report");
    await expect(report).toContainText("1,387 rows reconciled");
    await expect(report).toContainText("3 duplicates merged");
    await expect(report).toContainText("export.csv");
    await expect(report).toContainText("3 flagged");

    await page.getByTestId("report-revise").click();
    await expect(page.getByTestId("toast")).toContainText("Revision requested · the EA redoes the flagged part");
  });

  test("DC-08: Teach from a report opens the sheet and saves a rule with from: the task", async ({ page }) => {
    await openTaskDetail(page, "t9", "done");
    const before = await db(page);
    await page.getByTestId("report-teach").click();
    await expect(page.getByTestId("teach-sheet")).toBeVisible({ timeout: 2000 });
    await page.getByTestId("teach-text").fill("Always flag anything over $1,000 for review.");
    await page.getByTestId("teach-save").click();

    const after = await db(page);
    // ST-1: a taught rule is an `AutonomyRule` now — `db.rules` and V2.1's four
    // `/rules` routes were retired with Brain's parallel list. The task it came
    // off is in the id rather than in a `from` object, and the rule is APPENDED
    // rather than unshifted, so it is the last one and not the first.
    expect(after.autonomyRules.length).toBe(before.autonomyRules.length + 1);
    // B-198 / §4: traceable to task t9, and distinct from any id a card
    // mints server-side, so the two can never collide
    expect(after.autonomyRules.at(-1).id.startsWith("ar-t9-taught-")).toBe(true);
    expect(after.autonomyRules.at(-1).text).toBe("Always flag anything over $1,000 for review.");
    expect(after.autonomyRules.at(-1).addedBy).toBe("josh");
  });
});

test.describe("TK-12 a task from Joce", () => {
  test("the list row and the detail both offer Accept; accepting sets owner to Josh", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "tasks");
    await expect(page.getByTestId("task-accept-t3")).toBeVisible();
    // JQ-4 (A-67, via §4): Joce wears her own two letters now, not the "J"
    // she used to share with Josh.
    await expect(page.getByTestId("task-tag-t3")).toHaveText("JM");

    await page.getByTestId("task-open-t3").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect(page.getByTestId("task-accept")).toBeVisible();
    await expect(page.getByTestId("task-delegate")).toBeVisible();

    await page.getByTestId("task-accept").click();
    await expect(page.getByTestId("task-accept")).toHaveCount(0);

    const state = await db(page);
    expect(state.tasks.find((t: { id: string }) => t.id === "t3").owner).toBe("josh");
    assertCleanConsole(log);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const rig = (page: import("@playwright/test").Page) => ({
  goOffline: () => page.evaluate(() => (window as any).__JSTACK__.goOffline()),
  goOnline: () => page.evaluate(() => (window as any).__JSTACK__.goOnline()),
  outbox: () => page.evaluate(() => (window as any).__JSTACK__.outbox()) as Promise<{ offlineId: string; path: string }[]>,
  forceConflict: (id: string) => page.evaluate((offlineId) => (window as any).__JSTACK__.forceConflict(offlineId), id),
  task: (id: string) =>
    page.evaluate((taskId) => ((window as any).__JSTACK__.stores.tasks().list as { id: string }[]).find((t) => t.id === taskId), id) as Promise<
      Record<string, unknown> | undefined
    >,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * TK-02..TK-05 (T-1, ADR-42) — the card can be edited.
 *
 * Every case asserts on the STORE as well as the screen. A priority control
 * that moves and sends nothing looks identical to one that works, and that is
 * exactly the defect this row exists to add a control without.
 */
test.describe("TK-02 priority is a control on the card", () => {
  test("a tap PATCHes and the row updates without a reload", async ({ page }) => {
    await openTaskDetail(page, "t3");
    await page.getByTestId("task-priority").getByRole("tab", { name: "High" }).click();
    await expect.poll(async () => (await rig(page).task("t3"))?.priority).toBe("high");

    // and the list row behind the dialog carries it — no reload, no refetch
    // the test drove itself
    await page.getByTestId("task-detail-close").click();
    await expect(page.getByTestId("task-row-t3")).toContainText("high");
  });
});

test.describe("TK-03 start and end", () => {
  test("a day with no time yet means 9:00am, and 5:00pm for the end", async ({ page }) => {
    await openTaskDetail(page, "t3");

    await page.getByTestId("task-starts").click();
    await expect(page.getByTestId("task-starts-panel")).toBeVisible();
    // whatever today is, in this browser's zone — the panel opens on it
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await page.getByTestId(`task-starts-day-${today}`).click();

    await expect.poll(async () => (await rig(page).task("t3"))?.startsAt).toBeTruthy();
    await expect(page.getByTestId("task-starts")).toContainText("9:00am");
  });

  test("an end before the start is refused, and the honest line sits under it", async ({ page }) => {
    await openTaskDetail(page, "t1"); // already has a window from the fixtures
    await page.getByTestId("task-ends").click();
    // 6:00am on the start's own day is before a 9:00am start
    const startDay = await page.evaluate(() => {
      const iso = ((window as any).__JSTACK__.stores.tasks().list as { id: string; startsAt?: string }[]).find((t) => t.id === "t1")?.startsAt;
      const d = new Date(iso as string);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await page.getByTestId(`task-ends-day-${startDay}`).click();
    // moving the end onto the start's day is legal (it lands at 5pm, after a
    // 9am start) — the value to restore is the one the REFUSED edit was made
    // from, not the one the card opened with
    await expect.poll(async () => (await rig(page).task("t1"))?.endsAt).toBeTruthy();
    const before = (await rig(page).task("t1"))?.endsAt;
    await page.getByTestId("task-ends-time-06:00").click();

    await expect(page.getByTestId("task-edit-error-endsAt")).toContainText("before the start");
    // and the value the server refused is not the value the card shows
    await expect.poll(async () => (await rig(page).task("t1"))?.endsAt).toBe(before);
  });
});

test.describe("TK-04 the title is edited in place", () => {
  test("rename saves on blur; an empty title is refused without a round trip", async ({ page }) => {
    await openTaskDetail(page, "t3");
    await page.getByTestId("task-title-edit").click();
    const field = page.getByTestId("task-title-field");
    await field.fill("Book the Bali flights");
    await field.press("Enter");
    await expect.poll(async () => (await rig(page).task("t3"))?.title).toBe("Book the Bali flights");

    await page.getByTestId("task-title-edit").click();
    await page.getByTestId("task-title-field").fill("   ");
    await page.getByTestId("task-title-field").press("Enter");
    await expect(page.getByTestId("task-edit-error-title")).toContainText("needs a title");
    await expect.poll(async () => (await rig(page).task("t3"))?.title).toBe("Book the Bali flights");
  });
});

test.describe("TK-05 an edit made offline is a capture", () => {
  test("it queues, says so, replays on reconnect, and a 409 lands in Settings › Sync", async ({ page }) => {
    await openTaskDetail(page, "t3");
    await rig(page).goOffline();

    await page.getByTestId("task-priority").getByRole("tab", { name: "High" }).click();
    // the optimistic value stands — the outbox will carry it
    await expect.poll(async () => (await rig(page).task("t3"))?.priority).toBe("high");
    await expect.poll(async () => (await rig(page).outbox()).filter((e) => e.path.startsWith("/tasks/t3")).length).toBe(1);

    const entry = (await rig(page).outbox()).find((e) => e.path.startsWith("/tasks/t3"))!;
    await rig(page).forceConflict(entry.offlineId);
    await rig(page).goOnline();

    // the server refused the replay; the local value is listed rather than
    // silently dropped (OF-07's promise, for a field edit)
    await expect.poll(async () => (await rig(page).outbox()).length, { timeout: 15000 }).toBe(0);
    await page.getByTestId("task-detail-close").click();
    const settingsEntry = page.getByTestId("rail-settings");
    if (await settingsEntry.count()) await settingsEntry.click();
    else await page.getByTestId("header").getByLabel("Settings").click();
    await page.getByTestId("settings-sync").click();
    await expect(page.getByTestId("sync-dialog")).toContainText("Could not be applied");
  });
});

/**
 * TK-06..TK-09 (T-2, ADR-42) — delegation is the whole task, and a subtask is
 * a thing you can change.
 *
 * The defect underneath this row was invisible from outside: delegating wrote
 * `delegated` and nothing else, while every surface reads `owner` and `work`.
 * So each case checks a FIELD and a rendered line, not a status code.
 */
test.describe("TK-06/TK-07 delegating the whole task", () => {
  test("the verb names the default delegatee, and with two it opens a picker", async ({ page }) => {
    await openTaskDetail(page, "t3");
    // the roster has EA and Dev, so this is the picker branch
    await expect(page.getByTestId("task-delegate")).toContainText("Delegate to EA");
    await page.getByTestId("task-delegate").click();
    await expect(page.getByTestId("delegate-picker")).toBeVisible();

    await page.getByTestId("delegate-to-dev-pick").click();
    await expect.poll(async () => (await rig(page).task("t3"))?.owner).toBe("dev");
    await expect.poll(async () => ((await rig(page).task("t3"))?.work as { agentId?: string } | undefined)?.agentId).toBe("dev");
  });

  test("the delegated marker lands on the card and the row in the same render", async ({ page }) => {
    await openTaskDetail(page, "t3");
    await page.getByTestId("task-delegate").click();
    await page.getByTestId("delegate-to-ea-pick").click();

    await expect(page.getByTestId("task-detail-meta")).toContainText("delegated");
    await page.getByTestId("task-detail-close").click();
    await expect(page.getByTestId("task-row-t3")).toContainText("delegated");
  });
});

test.describe("TK-08/TK-09 subtasks", () => {
  test("the checkbox toggles and the count follows", async ({ page }) => {
    await openTaskDetail(page, "t1");
    const before = (await rig(page).task("t1"))?.subtasks as { id: string; done: boolean }[];
    const first = before[0];

    await page.getByTestId(`subtask-cb-${first.id}`).click();
    await expect
      .poll(async () => ((await rig(page).task("t1"))?.subtasks as { id: string; done: boolean }[]).find((s) => s.id === first.id)?.done)
      .toBe(!first.done);
  });

  test("the ⋮ menu renames, re-delegates, and deletes with an undo that restores the same subtask", async ({ page }) => {
    await openTaskDetail(page, "t1");
    const subtasks = (await rig(page).task("t1"))?.subtasks as { id: string; title: string }[];
    const target = subtasks[0];

    // rename
    await page.getByTestId(`subtask-menu-${target.id}`).click();
    await expect(page.getByTestId("subtask-menu")).toBeVisible();
    await page.getByTestId("subtask-rename").click();
    await page.getByTestId("subtask-title-field").fill("Redact the third batch");
    await page.getByTestId("subtask-rename-save").click();
    await expect
      .poll(async () => ((await rig(page).task("t1"))?.subtasks as { id: string; title: string }[]).find((s) => s.id === target.id)?.title)
      .toBe("Redact the third batch");

    // change delegation
    await page.getByTestId(`subtask-menu-${target.id}`).click();
    await page.getByTestId("subtask-owner-dev-pick").click();
    await expect
      .poll(async () => ((await rig(page).task("t1"))?.subtasks as { id: string; owner: string }[]).find((s) => s.id === target.id)?.owner)
      .toBe("dev");

    // delete, then undo — and what comes back is the SAME subtask
    await page.getByTestId(`subtask-menu-${target.id}`).click();
    await page.getByTestId("subtask-delete").click();
    await expect
      .poll(async () => ((await rig(page).task("t1"))?.subtasks as { id: string }[]).some((s) => s.id === target.id))
      .toBe(false);

    await page.getByTestId("toast-undo").click();
    await expect
      .poll(async () => ((await rig(page).task("t1"))?.subtasks as { id: string; title: string; owner: string }[]).find((s) => s.id === target.id))
      .toMatchObject({ id: target.id, title: "Redact the third batch", owner: "dev" });
  });
});

/**
 * The task as the SERVER holds it. `rig(page).task()` reads the store's list,
 * which drops a completed task (the open-only view) — so a case about
 * completing has to ask the db, or it is asserting on absence and calling it
 * a status.
 */
const serverTask = async (page: import("@playwright/test").Page, id: string) =>
  ((await db(page)).tasks as { id: string; status: string; subtasks: { id: string; done: boolean }[] }[]).find((t) => t.id === id);

/**
 * TK-10..TK-13 (T-3, ADR-42) — the completion rule.
 *
 * The one confirm in this app. Everywhere else the rule is "undo, not
 * confirm"; here the COUNT is the content of the question, and an undo can put
 * six subtasks back without ever telling you that six were closed.
 */
test.describe("TK-10 the completion rule", () => {
  test("ticking a task with open subtasks asks, and 'No' opens the card instead", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    await page.getByTestId("task-cb-t1").click();

    await expect(page.getByTestId("complete-confirm")).toBeVisible();
    await expect(page.getByTestId("complete-confirm-count")).toContainText("subtask");
    // nothing has happened yet — that is the whole point of asking
    await expect.poll(async () => (await serverTask(page, "t1"))?.status).not.toBe("done");

    await page.getByTestId("complete-confirm-no").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect.poll(async () => (await serverTask(page, "t1"))?.status).not.toBe("done");
  });

  test("'Yes, complete all' closes the task and its open subtasks, and the undo reverses both", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    const openBefore = (await serverTask(page, "t1"))!.subtasks.filter((s) => !s.done).map((s) => s.id);
    expect(openBefore.length).toBeGreaterThan(0);

    await page.getByTestId("task-cb-t1").click();
    await page.getByTestId("complete-confirm-yes").click();

    await expect.poll(async () => (await serverTask(page, "t1"))?.status).toBe("done");
    await expect
      .poll(async () => (await serverTask(page, "t1"))?.subtasks.every((s) => s.done))
      .toBe(true);

    await page.getByTestId("toast-undo").click();
    await expect.poll(async () => (await serverTask(page, "t1"))?.status).not.toBe("done");
    await expect
      .poll(async () => (await serverTask(page, "t1"))?.subtasks.filter((s) => !s.done).map((s) => s.id))
      .toEqual(openBefore);
  });

  test("a task with no open subtasks completes without asking (TK-10)", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    await page.getByTestId("task-cb-t5").click();
    await expect(page.getByTestId("complete-confirm")).toHaveCount(0);
    await expect.poll(async () => (await serverTask(page, "t5"))?.status).toBe("done");
  });
});

test.describe("TK-11/TK-12 completing from the card, and who finished it", () => {
  test("'Complete all subtasks' is there only while one is open, and it says who and when", async ({ page }) => {
    await openTaskDetail(page, "t1");
    await expect(page.getByTestId("task-complete-all")).toBeVisible();
    await page.getByTestId("task-complete-all").click();

    await expect.poll(async () => (await serverTask(page, "t1"))?.status).toBe("done");
    // TK-12's line, composed by the app from completedBy + completedAt
    await expect(page.getByTestId("task-completed-line")).toContainText("Completed · Josh ·");
    // and the verb is gone, because there is nothing left to complete
    await expect(page.getByTestId("task-complete-all")).toHaveCount(0);
  });
});

/**
 * US-01/US-02 (T-4, ADR-43) — what the runs on this task cost.
 *
 * The claim these two make that no Jest case can: the numbers are on the card
 * a person actually opens, in the reader's own zone, and the subtask's run is
 * under the subtask rather than lost in the task's list.
 */
test.describe("US-01/US-02 usage on the task card", () => {
  test("each agent run shows the model, both token counts with separators, the cost and when", async ({ page }) => {
    const log = await openTaskDetail(page, "t2"); // the EA's redaction job — two runs
    const activity = page.getByTestId("task-activity");
    await expect(activity).toContainText("EA · claude-sonnet-5 · 12,400 in · 3,100 out · $0.38");
    await expect(activity).toContainText("EA · claude-haiku-4-5 · 4,200 in · 900 out · $0.02");
    // mid-task there is no total: a running figure presented as a result
    await expect(page.getByTestId("task-usage-total")).toHaveCount(0);
    assertCleanConsole(log);
  });

  test("a completed task carries the total line", async ({ page }) => {
    await openTaskDetail(page, "t9", "done");
    await expect(page.getByTestId("task-usage-total")).toHaveText("Total · 1 model · 12,200 tokens · $0.03");
  });

  test("a subtask's run lists under the subtask, not under the task", async ({ page }) => {
    await openUnlocked(page);
    // the overnight delegation is a day-2 fact: t1-3 finished while he slept
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
    await page.evaluate(() => (window as any).__JSTACK__.reset("day2"));
    await gotoTab(page, "tasks");
    await page.getByTestId("task-open-t1").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();

    await expect(page.getByTestId("subtask-usage-u4")).toContainText("18,600 in · 4,900 out · $0.42");
    // and it is INSIDE the subtasks card, which is the whole point of US-02
    await expect(page.getByTestId("subtasks")).toContainText("$0.42");
    await expect(page.getByTestId("task-activity")).not.toContainText("18,600 in");
  });
});

/**
 * JQ-01 (Josh, 8 Sep) — "add labels to the start and end date fields and spread
 * them out a little more; labels in the same font and size as 'JSTACK · Tue 8
 * Sep · high'".
 *
 * The two date chips carried their own placeholder text ("Add start") and
 * nothing else, so once a date was chosen the chip read "Sun 6 Sep, 9:00am"
 * with no word anywhere saying which end of the task it was. Two of them side
 * by side, eight pixels apart.
 *
 * The font is READ OFF the meta line in the same test rather than written down
 * here. Josh named that line as the reference, and a hard-coded 10.5 would pass
 * on the day it was typed and silently stop meaning anything the moment the
 * scale moved.
 */
test.describe("JQ-01 the date fields say which end they are", () => {
  test("Start and End are labelled in the meta line's own font, and the fields are apart", async ({ page, viewport }) => {
    await openTaskDetail(page, "t1");
    const dialog = page.getByTestId("task-detail");
    await expect(dialog.getByTestId("task-starts-label")).toHaveText("Start");
    await expect(dialog.getByTestId("task-ends-label")).toHaveText("End");

    const style = (testId: string) =>
      dialog.getByTestId(testId).evaluate((el) => {
        const s = getComputedStyle(el);
        return { family: s.fontFamily, size: s.fontSize };
      });
    const meta = await style("task-detail-meta");
    expect(await style("task-starts-label")).toEqual(meta);
    expect(await style("task-ends-label")).toEqual(meta);

    const starts = (await dialog.getByTestId("task-starts").boundingBox())!;
    const ends = (await dialog.getByTestId("task-ends").boundingBox())!;
    if ((viewport?.width ?? 0) < 768) {
      // stacked on the phone, and genuinely clear of each other rather than
      // merely in a column
      expect(ends.y).toBeGreaterThanOrEqual(starts.y + starts.height);
    } else {
      expect(ends.x).toBeGreaterThanOrEqual(starts.x + starts.width + 16);
    }
  });
});

/**
 * JQ-02 (Josh, 8 Sep) — "the Delegate to EA popup opens in the bottom right of
 * the screen; it should be front and centre".
 *
 * It was registered as a SHEET, and a sheet on a desktop is a panel pinned to
 * one corner of a 1920px window — which is exactly where Josh found it. A sheet
 * is the phone's grammar for a short list of choices and stays that on a phone;
 * on a desktop the same short list is a centred modal.
 */
test.describe("JQ-02 the delegate picker is front and centre on a desktop", () => {
  test("centred horizontally and in the middle third vertically; still a bottom sheet on the phone", async ({ page, viewport }) => {
    await openTaskDetail(page, "t5"); // two delegatees, so the picker opens
    await page.getByTestId("task-delegate").click();
    const picker = page.getByTestId("delegate-picker");
    await expect(picker).toBeVisible();

    const b = (await picker.boundingBox())!;
    const w = viewport?.width ?? 0;
    const h = viewport?.height ?? 0;

    if (w < 768) {
      // the phone keeps the sheet: full width, sitting at the bottom
      expect(b.x).toBeLessThanOrEqual(2);
      expect(Math.abs(b.width - w)).toBeLessThanOrEqual(2);
      expect(b.y + b.height).toBeGreaterThan(h * 0.8);
    } else {
      expect(Math.abs(b.x + b.width / 2 - w / 2)).toBeLessThanOrEqual(8);
      const centreY = b.y + b.height / 2;
      expect(centreY).toBeGreaterThan(h / 3);
      expect(centreY).toBeLessThan((h * 2) / 3);
    }
  });
});

test.describe("the task card's headings and its fit (X1-05, X1-11 — P-9)", () => {
  test("the FILES heading row is as tall as SUBTASKS', and at 1366 the card fits its dialog", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    await page.getByTestId("task-open-t1").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect(page.getByTestId("task-files")).toBeVisible();
    const m = await page.evaluate(() => {
      const rowOf = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.firstElementChild?.getBoundingClientRect();
      const files = rowOf("task-files");
      const subtasks = rowOf("subtasks");
      const d = document.querySelector('[data-testid="task-detail"]');
      const sv = d ? Array.from(d.querySelectorAll("*")).find((el) => getComputedStyle(el).overflowY !== "visible" && el.scrollHeight > el.clientHeight + 1) : null;
      return { files: files ? Math.round(files.height) : -1, subtasks: subtasks ? Math.round(subtasks.height) : -1, scrolls: sv != null, over: sv ? sv.scrollHeight - sv.clientHeight : 0 };
    });
    // X1-05: the heading row is the label's own height, not the attach control's
    expect(Math.abs(m.files - m.subtasks)).toBeLessThanOrEqual(1);
    // X1-11: at 1366 the whole card is on screen — no fold through the last card
    if (width >= 1180) expect(m).toMatchObject({ scrolls: false });
  });
});

/**
 * S6-41 (ux round 2, Stage 6) — the delegate picker painted a second scrim
 * over the task card's, taking the card to (118,117,113), 111 levels below
 * the ground. README Components: "scrim + ONE frosted sheet". One scrim, the
 * outermost: the host hands it to the first open overlay and no dialog or
 * sheet above it paints another.
 */
test.describe("S6-41 one scrim under a stack of overlays", () => {
  test("the delegate picker over the task card paints no scrim of its own", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "the phone's picker is a full-screen sheet over a full-screen card — no scrim to stack");
    await openTaskDetail(page, "t3");
    const scrimOf = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await scrimOf("task-detail-backdrop")).toBe("rgba(28, 26, 22, 0.3)");
    await page.getByTestId("task-delegate").click();
    await expect(page.getByTestId("delegate-picker")).toBeVisible();
    expect(await scrimOf("delegate-picker-backdrop")).toBe("rgba(0, 0, 0, 0)");
    expect(await scrimOf("task-detail-backdrop")).toBe("rgba(28, 26, 22, 0.3)");
    await page.getByTestId("delegate-picker-close").click();
  });
});

/**
 * C-3 — the task card is a real modal now: `role="dialog"`/`aria-modal`,
 * focus moves onto it on open, Tab traps inside its own controls, and the
 * routed screen behind it (`app/_layout.tsx`'s `stackRef`) is `inert` while
 * it is open, so nothing behind it is reachable at all — not "the rail
 * happens not to be next in tab order", but genuinely unfocusable.
 */
test.describe("C-3 the task card traps focus, and restores it on close", () => {
  test("role/aria-modal are set, Tab never reaches the rail behind it, and closing gives focus back", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    // opened with the row already focused, deliberately, and by a NATIVE
    // .click() rather than Playwright's simulated pointer sequence — a real
    // mouse click blurs the row before the dialog ever mounts (RNW's press
    // handling, not something C-3 touches), leaving nothing for "gives
    // focus back" to restore TO. A person who tabbed here before opening
    // the card is exactly who the restore is for.
    const opener = page.getByTestId("task-open-t1");
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="task-open-t1"]') as HTMLElement | null;
      el?.focus();
      el?.click();
    });
    await expect(page.getByTestId("task-detail")).toBeVisible();

    // role/aria-modal land on DialogHost's own wrapper, an ancestor of
    // `task-detail-backdrop` rather than that node itself — checked by
    // containment, not a fixed testID, so this does not care which one
    const dialogRegion = page.locator('[role="dialog"][aria-modal="true"]').filter({ has: page.getByTestId("task-detail") });
    await expect(dialogRegion).toHaveCount(1);

    // more presses than the card plausibly has controls — if the trap were
    // absent, this many Tabs walks clean off the end of the dialog and into
    // whatever is behind it (the rail's tab links, on a desktop width).
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const outside = await page.evaluate(() => {
        const dialog = document.querySelector('[data-testid="task-detail-backdrop"]');
        const active = document.activeElement;
        return dialog != null && active != null && active !== document.body && !dialog.contains(active);
      });
      expect(outside).toBe(false);
    }

    await page.getByTestId("task-detail-close").click();
    await expect(page.getByTestId("task-detail")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
