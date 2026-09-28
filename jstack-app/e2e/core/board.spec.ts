/**
 * BD-01..BD-06 — the board is Twenty's board now (B-1, ADR-45).
 *
 * It used to bucket cards client-side from a due LABEL — a string the server
 * writes for people to read — with no lane at all for `in_progress`, so a task
 * the EA was actively working sat in "Next" beside things nobody had started.
 * The columns come from `GET /tasks/columns` in Twenty's order, and a card
 * moves by drag or by menu.
 *
 * The drag is driven with `mouse.down/move×3/up` rather than a helper: three
 * moves is what proves the 4px threshold is measured from the press and not
 * from the last frame, and it is the sequence a real pointer sends.
 */
import { assertCleanConsole, db, expect, expectUndoToast, gotoTab, openUnlocked, pickProject, test, undo } from "../helpers";

async function openBoard(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "tasks");
  await page.getByTestId("task-seg").getByRole("tab", { name: "Board" }).click();
  await expect(page.getByTestId("board-scroll")).toBeVisible();
  return log;
}

/** the centre of an element, in page coordinates */
async function centre(page: import("@playwright/test").Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (box == null) throw new Error(`${testId} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("BD-01 the columns are Twenty's", () => {
  test("five lanes in server order, including In progress, with no due-label bucketing left", async ({ page }) => {
    const log = await openBoard(page);
    const board = page.getByTestId("board");
    for (const name of ["Now", "Next", "In progress", "Waiting", "Done"]) {
      await expect(board).toContainText(name);
    }
    // the lane ids are Column.ids, so the fifth lane exists because the server
    // says so and not because this app has a fifth idea
    await expect(page.getByTestId("board-lane-col-in-progress")).toBeVisible();
    // t2 is `in_progress` and used to sit in Next
    await expect(page.getByTestId("board-lane-col-in-progress")).toContainText("Redact the 200 sample emails");
    assertCleanConsole(log);
  });

  test("the order is the server's, not this file's", async ({ page }) => {
    await openBoard(page);
    const ids = await page.locator("[data-testid^='board-lane-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(ids).toEqual(["board-lane-col-now", "board-lane-col-next", "board-lane-col-in-progress", "board-lane-col-waiting", "board-lane-col-done"]);
  });
});

test.describe("BD-03 the names change in Twenty", () => {
  test("'Columns · edit in Twenty' confirms before leaving, and Refresh refetches", async ({ page }) => {
    await openBoard(page);
    await page.getByTestId("board-columns-twenty").click();
    await expect(page.getByTestId("external-link-dialog")).toBeVisible();
    await page.getByTestId("external-link-cancel").click();

    await page.getByTestId("board-refresh").click();
    await expect(page.getByTestId("board-lane-col-now")).toBeVisible();
  });
});

test.describe("BD-04 dragging a card", () => {
  test("moves it, sends the column with the status, and undo puts it back", async ({ page }) => {
    await openBoard(page);
    await expect(page.getByTestId("board-lane-col-now")).toContainText("Send Moz the sample pack");

    const from = await centre(page, "board-card-t1");
    const to = await centre(page, "board-lane-col-waiting");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y);
    await page.mouse.move((from.x + to.x) / 2, to.y);
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();

    await expect(page.getByTestId("board-lane-col-waiting")).toContainText("Send Moz the sample pack");
    await expectUndoToast(page);

    const state = await db(page);
    const t1 = state.tasks.find((t: { id: string }) => t.id === "t1");
    // the column is what moved; the status followed because Waiting has one
    expect(t1).toMatchObject({ column: "col-waiting", status: "waiting" });

    await undo(page);
    await expect.poll(async () => (await db(page)).tasks.find((t: { id: string }) => t.id === "t1")?.column).toBe("col-now");
  });

  test("a tap is still a tap — a 3px wobble opens the card rather than moving it", async ({ page }) => {
    await openBoard(page);
    const at = await centre(page, "board-card-t1");
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 2, at.y + 1);
    await page.mouse.up();
    await expect(page.getByTestId("task-detail")).toBeVisible();
  });
});

test.describe("BD-05 the same move without a drag", () => {
  test("the ⋮ menu lists the other columns and moves the card", async ({ page }) => {
    await openBoard(page);
    await page.getByTestId("board-menu-t1").click();
    await expect(page.getByTestId("board-card-menu-t1")).toContainText("Move to…");
    // its own column is not offered — a move to where it already is is not a move
    await expect(page.getByTestId("board-move-t1-col-now")).toHaveCount(0);

    await page.getByTestId("board-move-t1-col-next").click();
    await expect(page.getByTestId("board-lane-col-next")).toContainText("Send Moz the sample pack");
    // Now and Next both mean `open`, so the status did NOT change
    const t1 = (await db(page)).tasks.find((t: { id: string }) => t.id === "t1");
    expect(t1).toMatchObject({ column: "col-next", status: "open" });
  });

  test("a move into Done goes through the completion rule, never a bare status patch", async ({ page }) => {
    await openBoard(page);
    await page.getByTestId("board-menu-t1").click();
    await page.getByTestId("board-move-t1-col-done").click();
    // t1 has open subtasks, so the rule ASKS rather than completing (TK-10)
    await expect(page.getByTestId("complete-confirm")).toBeVisible();
    await page.getByTestId("complete-confirm-yes").click();

    await expect.poll(async () => (await db(page)).tasks.find((t: { id: string }) => t.id === "t1")?.status).toBe("done");
    const t1 = (await db(page)).tasks.find((t: { id: string }) => t.id === "t1");
    // the completion rule's own stamps, not a status the board wrote
    expect(t1.completedAt).toBeTruthy();
    expect(t1.completedBy).toBe("josh");
  });
});

test.describe("BD-06 an agent's card looks like an agent's card", () => {
  test("EA tag and dashed marker on the EA's; a person's own two letters on theirs; the running one pulses", async ({ page }) => {
    const log = await openBoard(page);
    // t2 is the EA's and is running
    await expect(page.getByTestId("board-tag-t2")).toHaveText("EA");
    await expect(page.getByTestId("board-card-t2")).toHaveCSS("border-style", "dashed");
    await expect(page.getByTestId("work-pulse-t2")).toHaveAttribute("data-animating", "on");

    // t1 is Josh's OWN, and a marker means "somebody else's" — so it carries
    // none. The board used to draw an initial circle on every card including
    // the viewer's, which is a marker that marks nothing (§4, B2-04).
    await expect(page.getByTestId("board-tag-t1")).toHaveCount(0);
    // t3 is Joce's, and Josh is the one looking, so it does carry one — the
    // same letter the list row beside it uses, from the same table
    // JQ-4 (A-67, via §4): the person's own abbreviation, not a shared initial
    await expect(page.getByTestId("board-tag-t3")).toHaveText("JM");
    assertCleanConsole(log);
  });
});

test.describe("BD-02 showing fewer lanes than Twenty holds", () => {
  test("the chosen columns are the visible set, and the choice shows as an active chip", async ({ page }) => {
    await openBoard(page);
    await expect(page.getByTestId("board-lane-col-waiting")).toBeVisible();

    await page.getByTestId("task-filter-open").click();
    await page.getByTestId("filter-columns-col-now").click();
    await page.getByTestId("filter-columns-col-next").click();
    await page.getByTestId("filter-apply").click();

    await expect(page.getByTestId("board-lane-col-now")).toBeVisible();
    await expect(page.getByTestId("board-lane-col-waiting")).toHaveCount(0);
    // and the board says so on the board, not only inside the panel
    await expect(page.getByTestId("active-filter-columns-col-now")).toContainText("Now");

    // one tap puts a lane back
    await page.getByTestId("active-filter-columns-col-now").click();
    await expect(page.getByTestId("board-lane-col-next")).toBeVisible();
    await expect(page.getByTestId("board-lane-col-now")).toHaveCount(0);

    // and Clear returns every lane
    await page.getByTestId("task-clear").click();
    await expect(page.getByTestId("board-lane-col-waiting")).toBeVisible();
  });
});

test.describe("the strip at the phone's edge, and the card says what the row says (B2-03, B2-07 — P-9)", () => {
  test("at 393 the lanes clip at the screen edge, not 20 px inside it; a recurring task's meta matches the list row's", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    const listMeta = (await page.getByTestId("task-open-t8").innerText()).split("\n").slice(1).join(" ").trim();
    expect(listMeta).not.toBe("");
    await openBoard(page);
    const strip = await page.getByTestId("board-scroll").boundingBox();
    if (width < 768) {
      expect(Math.round(strip!.x)).toBe(0);
      expect(Math.round(strip!.x + strip!.width)).toBe(width);
    }
    await expect(page.getByTestId("board-meta-t8")).toHaveText(listMeta);
  });
});

/**
 * Stage 6 A-3 — what the device pass measured on the board (ux round S6-03,
 * S6-14, S6-20, S6-35).
 *
 * Each of these is a pixel claim the Jest lanes cannot make: two boxes that
 * must not share a pixel, two x positions that must agree, a label that must
 * be two things, and a lane that must change dress while a card is in the air.
 */
async function box(page: import("@playwright/test").Page, testId: string) {
  const b = await page.getByTestId(testId).boundingBox();
  if (b == null) throw new Error(`${testId} has no box`);
  return b;
}

test.describe("S6-03 the ⋮ and the meta line share no pixel", () => {
  test("the button's box and the meta's box do not intersect, on a card whose title is one line", async ({ page }) => {
    await openBoard(page);
    // t4 "Waiting-on digest" fits one line at a 200px lane, which is exactly
    // the case the pass measured: 26.6px of `EA · low priority · recurring ·`
    // sat inside the button's rectangle, with the three dots on the `ri`
    const menu = await box(page, "board-menu-t4");
    const meta = await box(page, "board-meta-t4");
    const apart = menu.x + menu.width <= meta.x || meta.x + meta.width <= menu.x || menu.y + menu.height <= meta.y || meta.y + meta.height <= menu.y;
    expect({ apart, menu, meta }).toEqual({ apart: true, menu, meta });
  });
});

test.describe("S6-14 the meta line starts at one x whether or not the card wears a mark", () => {
  test("a card with an EA tag and a card with none put their meta on the same x", async ({ page }) => {
    await openBoard(page);
    // t4 wears EA; t5 (Passport renewal forms) is Josh's own and wears nothing.
    // Both sit in Next, so the lane's x is the same and only the slot differs.
    const tagged = await box(page, "board-meta-t4");
    const bare = await box(page, "board-meta-t5");
    expect(Math.round(bare.x)).toBe(Math.round(tagged.x));
  });
});

test.describe("S6-20 a lane's count is a Marker badge beside its name, not text after a dot (K1-11, B-77)", () => {
  test("the Now lane reads its name and its count as two things", async ({ page }) => {
    await openBoard(page);
    const header = page.getByTestId("board-lane-col-now").locator("xpath=./div[1]");
    await expect(header).toHaveText(/^Now\s*1$/);
    await expect(header).not.toContainText("·");
  });
});

test.describe("S6-35 the lane under the pointer says it will take the card", () => {
  test("mid-drag the lane under the pointer is dressed as the drop, the card's own lane is not, and going home drops nothing", async ({ page }) => {
    await openBoard(page);
    const from = await centre(page, "board-card-t1");
    // Next is the lane beside Now, so it is on screen at every width
    const to = await centre(page, "board-lane-col-next");
    const next = page.getByTestId("board-lane-col-next");
    const now = page.getByTestId("board-lane-col-now");
    const restingFill = await next.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y);
    await page.mouse.move((from.x + to.x) / 2, to.y);
    await page.mouse.move(to.x, to.y);

    // in the air, over Next: Next is the drop, Now is not
    await expect(next).toHaveAttribute("data-drop-target", "on");
    await expect(now).toHaveAttribute("data-drop-target", "off");
    expect(await next.evaluate((el) => getComputedStyle(el).borderStyle)).toBe("dashed");
    expect(await next.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(restingFill);

    // back over its own lane: no lane is a drop, and letting go there moves nothing
    await page.mouse.move(from.x, from.y);
    await expect(next).toHaveAttribute("data-drop-target", "off");
    await expect(now).toHaveAttribute("data-drop-target", "off");
    await page.mouse.up();
    await expect(next).toHaveAttribute("data-drop-target", "off");
    await expect(page.getByTestId("board-lane-col-now")).toContainText("Send Moz the sample pack");
    await expect(page.getByTestId("toast-undo")).toHaveCount(0);
    const state = await db(page);
    expect(state.tasks.find((t: { id: string }) => t.id === "t1").column).toBe("col-now");
  });
});

/**
 * A4-11 (the A-4 audit) — rule 20: Accent ink is the TAPPABLE phrase.
 *
 * `board-more-lanes` says how many lanes are off the right edge (B1-05). It is
 * a cue, not a control — and it was dressed as one: Accent ink, a 36px tap
 * height and an arrow, sitting beside two phrases identical in dress that both
 * act. The two links keep their ink; the cue takes Muted, which is what the
 * rule gives meta. Read off the rendered element rather than the source, so a
 * later change of tone cannot pass this by keeping the prop name.
 */
test.describe("A4-11 the hidden-lanes cue is dressed as a cue", () => {
  test("it is Muted where the two real links beside it are Accent ink, and it answers no press", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openBoard(page);
    const cue = page.getByTestId("board-more-lanes");
    test.skip((await cue.count()) === 0, `no lane is hidden at ${width}px — nothing to dress`);

    const colourOf = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).color);
    const [cueColour, linkColour] = [await colourOf("board-more-lanes"), await colourOf("board-columns-twenty")];
    expect({ cueIsTheLinkColour: cueColour === linkColour }).toEqual({ cueIsTheLinkColour: false });

    // and it is honestly not a control: no button role, and no cursor promise
    expect(await cue.getAttribute("role")).toBeNull();
    expect(await cue.evaluate((el) => getComputedStyle(el).cursor)).not.toBe("pointer");
  });
});
