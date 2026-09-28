/**
 * TD-01, TD-02, TD-04..08, LF-02 (Today half), DS-05 — the header delta
 * line, the Calendar list, Your tasks, At a glance, Close the day, Review,
 * and computed-style checks on the pack's own surface tokens.
 */
import { assertCleanConsole, expect, expectUndoToast, openUnlocked, test, undo } from "../helpers";

test.describe("TD-02 header health line", () => {
  test("phone: 'all healthy/needs attention · $X.XX' on its own line under the header, the figure is sens; desktop: same on the rail", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === "w393-light";
    await openUnlocked(page);
    const health = page.getByTestId(phone ? "header-health" : "rail-health");
    await expect(health).toBeVisible();
    await expect(health).toHaveText(/^(all healthy|needs attention) · \$\d+\.\d{2}$/);
    const sensCount = await health.evaluate((el) => el.querySelectorAll("[data-sens]").length);
    expect(sensCount).toBe(1); // the spend figure, and only it, is sens
  });
});

test.describe("DS-05 surface tokens: computed styles", () => {
  test("card = card token, blur 20, border, radius 10, shadow; ghost = dashed hairline", async ({ page }) => {
    await openUnlocked(page);
    const card = await page.getByTestId("decision-card-c1").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderWidth: cs.borderWidth, borderRadius: cs.borderRadius, backdropFilter: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter, boxShadow: cs.boxShadow };
    });
    expect(card.borderWidth).toBe("1px");
    expect(card.borderRadius).toBe("10px");
    expect(card.backdropFilter).toContain("blur(20px)");
    expect(card.boxShadow).not.toBe("none");

    await page.getByTestId("tab-life").click();
    const ghost = await page.getByTestId("health-ghost").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderStyle: cs.borderStyle, borderWidth: cs.borderWidth };
    });
    expect(ghost.borderStyle).toBe("dashed");
    expect(ghost.borderWidth).toBe("1px");
  });

  /**
   * DS-05, second half — the OVERLAY surfaces. The ux-reviewer's round-1 D1
   * found every sheet, dialog and panel painting `card` (alpha .58) with no
   * backdrop filter at all, so the page underneath read straight through and
   * settings text landed on decision-card text. The pack's overlay recipe is
   * a blurred scrim under a BAR surface: README Surfaces ("Bar … blur 24px")
   * and handoff.md Settings ("Scrim rgba(28,26,22,.3) + blur 4 … Bar
   * surface"). `misc.scrimBlur` existed in tokens.ts and was never read —
   * the same never-applied-token shape as B-38's `blur.card`.
   */
  test("overlays occlude: scrim blur 4, sheet/dialog on the bar surface at blur 24", async ({ page }) => {
    await openUnlocked(page);
    const read = async (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, bf: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter };
      });

    // the Settings sheet (SE-09) — its own component, not <Sheet>
    const settingsRail = page.getByTestId("rail-settings");
    if (await settingsRail.count()) await settingsRail.click();
    else await page.getByTestId("header").getByLabel("Settings").click();
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    expect((await read("settings-backdrop")).bf).toContain("blur(4px)");
    expect((await read("settings-sheet")).bf).toContain("blur(24px)");
    await page.getByTestId("settings-close").click();

    // <Dialog> — the decision history on Agents
    await page.getByTestId("tab-agents").click();
    await page.getByTestId("history-search").click();
    await expect(page.getByTestId("agents-history-dialog")).toBeVisible();
    expect((await read("agents-history-dialog-backdrop")).bf).toContain("blur(4px)");
    expect((await read("agents-history-dialog")).bf).toContain("blur(24px)");
  });

  /**
   * DS-02 — the pack's TWO TYPEFACES actually render. Found while checking the
   * ux-reviewer's D19: the emphasised span in a memory proposal computes to
   * weight 500 (correct), but its family computed to `-apple-system,
   * BlinkMacSystemFont, …` — the system stack. 127 of 129 text nodes on Today
   * were in it, and `document.body` resolved to Times New Roman.
   *
   * Cause: `useFonts()` registers each face under its IMPORT KEY
   * (`InstrumentSans_400Regular`), so the pack's own stack — "'Instrument
   * Sans', -apple-system, …", straight out of design/tokens/typography.css —
   * matched nothing and fell through to its fallback. The whole app was
   * rendering in the OS UI font and Georgia/Times, which is the one thing a
   * design pack built on Instrument Sans + Source Serif 4 cannot survive.
   */
  test("DS-02 body text is Instrument Sans and titles are Source Serif 4, not the system fallback", async ({ page }) => {
    await openUnlocked(page);
    const seen = await page.evaluate(() => {
      const families = new Set<string>();
      document.querySelectorAll("div,span,p,button").forEach((el) => {
        if (el.childElementCount === 0 && (el.textContent ?? "").trim() !== "") families.add(getComputedStyle(el).fontFamily);
      });
      return [...families];
    });
    // every rendered family names one of the pack's two, first in its stack
    for (const f of seen) expect(f, `unexpected family: ${f}`).toMatch(/^"?(Instrument Sans|Source Serif 4)"?,/);
    expect(seen.some((f) => f.startsWith('"Instrument Sans"') || f.startsWith("Instrument Sans"))).toBe(true);
    expect(seen.some((f) => f.startsWith('"Source Serif 4"') || f.startsWith("Source Serif 4"))).toBe(true);

    // and the faces are really loaded under those names, at the pack's weights
    const faces = await page.evaluate(() => {
      const out: string[] = [];
      document.fonts.forEach((ff) => out.push(`${ff.family}|${ff.weight}|${ff.status}`));
      return out;
    });
    expect(faces).toContain("Instrument Sans|400|loaded");
    expect(faces).toContain("Instrument Sans|500|loaded");
    expect(faces).toContain("Source Serif 4|500|loaded");
  });
});

test.describe("TD-01 header delta line", () => {
  test("shows the live memory-proposal count and a 'Review the week' link", async ({ page }) => {
    const log = await openUnlocked(page);
    await expect(page.getByTestId("header-delta")).toContainText("4 memory proposals waiting");
    await expect(page.getByTestId("review-week-link")).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("TD-04 Calendar list", () => {
  test("today's rows are time-ordered with a prep line and free gaps; today/3 days/google switch views", async ({ page }) => {
    await openUnlocked(page);
    const list = page.getByTestId("calendar-list");
    await expect(list).toContainText("Andy · V2 kickoff");
    await expect(list).toContainText("Prep: re-read the memory-layer answer");
    await expect(list).toContainText("Free until");

    await page.getByTestId("cal-list-3day").click();
    await expect(list).toContainText("Deep work · Bundaberg memo");

    await page.getByTestId("cal-list-today").click();
    await expect(list).not.toContainText("Deep work · Bundaberg memo");

    await page.getByTestId("cal-list-google").click();
    await expect(page.getByTestId("external-link-dialog")).toBeVisible();
    await page.getByTestId("external-link-cancel").click();
    await expect(page.getByTestId("external-link-dialog")).toHaveCount(0);
  });
});

test.describe("TD-05 Your tasks", () => {
  test("checkbox marks done via PATCH with an undo toast; hint switches to Tasks", async ({ page }) => {
    await openUnlocked(page);
    // T-3: Today's checkbox runs the SAME completion rule as the Tasks list
    // (A-39). The first task has open subtasks, so the tick asks first and the
    // toast then reads "Completed" (§4). The claim — a tick writes, and the
    // undo takes it back — is unchanged.
    const firstCheckbox = page.locator('[data-testid^="your-task-cb-"]').first();
    await firstCheckbox.click();
    await page.getByTestId("complete-confirm-yes").click();
    await expectUndoToast(page, "Completed");
    await undo(page);

    await page.getByTestId("your-tasks-all").click();
    await expect(page.getByTestId("tab-tasks")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("TD-06 At a glance", () => {
  test("four cells render and each switches to Life", async ({ page }) => {
    await openUnlocked(page);
    // B-22: four habits are seeded done "today" (h1/h3/h5/h9) — this now
    // loads for real instead of always starting blank.
    await expect(page.getByTestId("glance-habits")).toContainText("4/9");
    await expect(page.getByTestId("glance-people")).toBeVisible();
    await expect(page.getByTestId("glance-money")).toBeVisible();
    await expect(page.getByTestId("glance-goals")).toBeVisible();

    await page.getByTestId("glance-habits").click();
    await expect(page.getByTestId("tab-life")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("TD-07/LF-02 Close the day", () => {
  test("nine compact habit chips toggle and are reflected in the glance count; empty journal is blocked", async ({ page }) => {
    await openUnlocked(page);
    const chips = page.locator('[data-testid^="close-habit-"]');
    await expect(chips).toHaveCount(9);

    // h2 (Burn) isn't one of the seeded done-today habits (h1/h3/h5/h9,
    // B-22) — toggling it ON is unambiguous: 4 seeded + this one = 5/9.
    await page.getByTestId("close-habit-h2").click();
    await expect(page.getByTestId("glance-habits")).toContainText("5/9");

    // NC-01/QA-01: a disabled control still handles a tap to explain why —
    // force past Playwright's own aria-disabled actionability guard
    // (BUGLOG_v2.md B-17).
    await page.getByTestId("close-day").getByLabel("Send", { exact: true }).click({ force: true });
    await expect(page.getByTestId("toast")).toContainText("Write something first");
  });

  test("a non-empty journal submits via POST /journal", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("close-journal").fill("Quiet day, good progress.");
    await page.getByTestId("close-day").getByLabel("Send", { exact: true }).click();
    await expect(page.getByTestId("close-journal")).toHaveText("");
  });
});

test.describe("TD-08 Review", () => {
  test("opens from the delta line's link with the three sections from GET /review", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("review-week-link").click();
    await expect(page.getByTestId("review-dialog")).toBeVisible();
    await expect(page.getByTestId("review-dialog")).toContainText("decisions");
    await expect(page.getByTestId("review-dialog")).toContainText("promises kept");
    await expect(page.getByTestId("review-dialog")).toContainText("The week ahead");
    await expect(page.getByTestId("review-dialog")).toContainText("Three things this week");
    await page.getByTestId("review-dialog-close").click();
    await expect(page.getByTestId("review-dialog")).toHaveCount(0);
  });
});
