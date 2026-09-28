/** AG-01..10, SEC-07 (caps), SEC-10 (portals), US-03/US-04 (Usage, T-4). */
import { assertCleanConsole, calls, db, expect, expectToast, expectUndoToast, gotoTab, openUnlocked, settle, test, undo } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__.biometric is test-only, untyped by design */
async function biometricApprove(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as any).__JSTACK__.biometric.approve());
}
async function biometricDecline(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as any).__JSTACK__.biometric.decline());
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function openAgents(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "agents");
  return log;
}

test.describe("AG-01 Stats", () => {
  test("four stat cards equal GET /agents/summary", async ({ page }) => {
    await openAgents(page);
    await expect(page.getByTestId("stat-runs")).toBeVisible();
    await expect(page.getByTestId("stat-success")).toContainText("%");
    await expect(page.getByTestId("stat-spend")).toBeVisible();
    await expect(page.getByTestId("stat-issues")).toContainText("2");
    await expect(page.getByTestId("stat-issues-dot")).toBeVisible();
  });
});

test.describe("AG-02/SEC-07 Spend and caps", () => {
  test("ring, month line, landing, heartbeat and caps render; edit caps needs a fresh biometric", async ({ page }) => {
    await openAgents(page);
    await expect(page.getByTestId("spend-ring")).toBeVisible();
    await expect(page.getByTestId("spend-this-month")).toContainText("this month");
    await expect(page.getByTestId("spend-landing")).toContainText("landing about");
    await expect(page.getByTestId("spend-heartbeat")).toBeVisible();
    await expect(page.getByTestId("cap-chip-EA")).toBeVisible();

    await page.getByTestId("spend-edit-caps").click();
    await expect(page.getByTestId("caps-dialog")).toBeVisible();

    // AG-01: the number has its units and its context. It was a bare box with
    // a figure in it — nothing said dollars, nothing said per month, and
    // nothing said what the agent had already spent.
    await expect(page.getByTestId("caps-dialog")).toContainText("AUD / month");
    await expect(page.getByTestId("caps-spent-EA")).toHaveText(/^\$[\d,.]+ of \$[\d,.]+ this month$/);

    // and the refusal is SHOWN, per field, with Save disabled for its reason
    // rather than dead — and rather than a silent failure after a Face ID
    await page.getByTestId("caps-input-EA").fill("$50");
    await expect(page.getByTestId("caps-error-EA")).toHaveText("Digits only — no symbols, no decimals");
    await expect(page.getByTestId("caps-save")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("caps-save")).toHaveAttribute("data-disabled-reason", "Digits only — no symbols, no decimals");

    await page.getByTestId("caps-input-EA").fill("123456");
    await expect(page.getByTestId("caps-error-EA")).toHaveText("That is more than 5 digits");

    // a good value clears both the line and the block
    await page.getByTestId("caps-input-EA").fill("150");
    await expect(page.getByTestId("caps-error-EA")).toHaveCount(0);
    await expect(page.getByTestId("caps-save")).toHaveAttribute("aria-disabled", "false");

    // decline first — SEC-07: no state change, exact toast copy
    await biometricDecline(page);
    await page.getByTestId("caps-input-EA").fill("999");
    await page.getByTestId("caps-save").click();
    await expectToast(page, "Cancelled — editing caps needs a fresh passkey check");
    await expect(page.getByTestId("caps-dialog")).toBeVisible();

    // approve — PUT /agents/caps goes through
    await biometricApprove(page);
    await page.getByTestId("caps-save").click();
    await expect(page.getByTestId("caps-dialog")).toHaveCount(0);
    const c = await calls(page);
    expect(c.some((x) => x.method === "putAgentCaps")).toBe(true);
  });
});

test.describe("AG-03/SEC-10 Portals", () => {
  test("every tile opens the outbound-link confirmation with the real domain", async ({ page }) => {
    await openAgents(page);
    await page.getByTestId("portal-Twenty").click();
    await expect(page.getByTestId("external-link-dialog")).toBeVisible();
    await expect(page.getByTestId("external-link-dialog")).toContainText("twenty.example");
  });
});

test.describe("AG-04 Agent issues", () => {
  test("Renew posts, the row leaves with an undo toast, and undo restores it", async ({ page }) => {
    await openAgents(page);
    await expect(page.getByTestId("agents-issues-section")).toContainText("2");
    await expect(page.getByTestId("issue-e1")).toBeVisible();

    await page.getByTestId("issue-act-e1").click();
    await expectUndoToast(page, "Renewed");
    await expect(page.getByTestId("issue-e1")).toHaveCount(0);

    await undo(page);
    await expect(page.getByTestId("issue-e1")).toBeVisible();
  });

  test("with no open issues: 'Nothing failing. Every check ran when it should.'", async ({ page }) => {
    await openAgents(page);
    await page.getByTestId("issue-act-e1").click();
    await settle(page); // e2 has just moved into e1's place (B-246)
    await page.getByTestId("issue-act-e2").click();
    await expect(page.getByTestId("issues-empty")).toContainText("Nothing failing. Every check ran when it should.");
  });
});

test.describe("AG-05 Last 24 hours", () => {
  test("the alert row carries Renew until its issue is done", async ({ page }) => {
    await openAgents(page);
    await expect(page.getByTestId("feed-renew-f3")).toBeVisible();
    await page.getByTestId("feed-renew-f3").click();
    await expect(page.getByTestId("feed-renew-f3")).toHaveCount(0);
  });
});

test.describe("AG-06/AG-07 Security checks", () => {
  test("the stale check reads accent-ink with 'see agent issues'; Run now flips it to ran-just-now", async ({ page }) => {
    await openAgents(page);
    await expect(page.getByTestId("check-chk3")).toContainText("7 days stale · see agent issues");

    await page.getByTestId("issue-act-e2").click();
    await expect(page.getByTestId("check-chk3")).toContainText("ran just now");
  });

  test("A63-01/A64-01: a check line may break only BETWEEN its values", async ({ page }) => {
    await openAgents(page);
    // the STATUS, not the row: the row's text begins with the check's name,
    // which is prose and breaks wherever it likes
    const lines = await page.locator("[data-testid^='check-chk']").evaluateAll((els) => els.map((e) => e.lastElementChild?.textContent ?? ""));
    expect(lines.length).toBe(7);
    for (const line of lines) {
      // The column is 164px at 1366 and three of these rows are longer than
      // that, so they WRAP — the only question is where. Every break point in
      // the line is an ordinary space, there is one of those after each
      // separator and nowhere else, so a wrap falls between one value and the
      // next. Two things follow, and round 3 and round 4 each caught one of
      // them the other way round.
      //
      // ONE: no value splits. Round 4 measured `6 planted · none` /
      // `tripped · Yesterday 6:00am` — a line of a security card, on its
      // own, saying something tripped yesterday.
      const values = line.split("·").map((v) => v.replace(/^[  ]+|[  ]+$/g, ""));
      expect({ line, split: values.filter((v) => v.includes(" ")) }).toEqual({ line, split: [] });
      // TWO: no line OPENS with a separator, which the pack forbids by name.
      // A separator with an ordinary space before it could begin a line;
      // one bound on BOTH sides cannot begin a line but leaves the value
      // either side of it as the only place to break, which is how round 4's
      // defect happened. Neither form may appear.
      expect({ line, before: / ·/.test(line) }).toEqual({ line, before: false });
      expect({ line, bothSides: /· /.test(line) }).toEqual({ line, bothSides: false });
    }
  });
});

test.describe("AG-08 Security checks — schedules hint", () => {
  test("opens the Settings sheet scrolled to Schedules (row 16)", async ({ page }) => {
    await openAgents(page);
    await page.getByTestId("checks-schedules").click();
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    await expect(page.getByTestId("settings-schedules")).toBeVisible();
  });
});

test.describe("AG-09 Decision history", () => {
  test("two rows inline; search opens the dialog; reopen puts the card back in Needs you", async ({ page }) => {
    await openAgents(page);
    const rows = page.locator('[data-testid="agents-history-section"] [data-testid^="history-row-"]');
    await expect(rows).toHaveCount(2);

    await page.getByTestId("history-search").click();
    await expect(page.getByTestId("agents-history-dialog")).toBeVisible();
    await page.getByTestId("agents-history-search").fill("Dentist");
    await expect(page.getByTestId("agents-history-row-h2")).toBeVisible();

    // reopen stays IN the dialog (like Memory's inline "ok") rather than
    // closing it — a search session can reopen more than one match.
    await page.getByTestId("agents-history-reopen-h2").click();
    await expectToast(page, "Reopened · back in Needs you");
    await expect(page.getByTestId("agents-history-row-h2")).toHaveCount(0);
    await page.getByTestId("agents-history-dialog-close").click();

    // NeedsYou's own composite caps at "≤5 open" by rank, so a reopened
    // low-priority item may not surface in that capped view even though
    // it's genuinely open again — check the underlying record directly.
    const state = await db(page);
    expect(state.actions.find((a: { id: string }) => a.id === "h2")?.state).toBe("open");
  });
});

test.describe("AG-10 header", () => {
  test("subtitle reads 'N need you · M runs today'; no focus chips", async ({ page }) => {
    await openAgents(page);
    await expect(page.getByTestId("header")).toContainText("need you");
    await expect(page.getByTestId("header")).toContainText("runs today");
    await expect(page.getByTestId("focus-chips")).toHaveCount(0);
  });
});

/**
 * AG-05 / US-03 / US-04 (T-4, ADR-43) — Agents › Usage.
 *
 * A configured section on a tab that had none: the whole point of B-1's
 * machinery was that a section like this needs a record and a bind, not a
 * component. So the case that matters here is that the record renders on the
 * Agents tab with the derived testIDs, and that the section VERB — a slot this
 * row added — actually puts text on the clipboard rather than toasting a claim.
 */
test.describe("AG-05/US-03 Usage", () => {
  test("the month's totals by agent and by model, and the tasks newest first", async ({ page }) => {
    const log = await openAgents(page);
    const section = page.getByTestId("agents-usage-section");
    await expect(section).toBeVisible();
    await expect(page.getByTestId("usage-total-spend")).toContainText("$0.43");
    await expect(page.getByTestId("usage-total-tokens")).toContainText("32,800");
    await expect(page.getByTestId("usage-total-agent-ea")).toContainText("EA");
    await expect(page.getByTestId("usage-total-model-claude-sonnet-5")).toContainText("$0.41");

    // newest first, and each row says how many runs and what they cost
    await expect(page.getByTestId("usage-task-t2")).toContainText("2 runs · $0.40");
    await expect(page.getByTestId("usage-task-t9")).toContainText("1 run · $0.03");
    assertCleanConsole(log);
  });

  test("a usage row opens the task card (resolution #51 — no dialog of its own)", async ({ page }) => {
    await openAgents(page);
    await page.getByTestId("usage-task-act-t2").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await expect(page.getByTestId("task-detail")).toContainText("Redact the 200 sample emails");
  });
});

test.describe("US-04 Copy as CSV", () => {
  test("puts the named columns and one line per row on the clipboard, and toasts the count", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openAgents(page);
    // the verb copies what is ON SCREEN, so wait for the section to have it:
    // clicking into a section that has not loaded copies nothing, honestly and
    // uselessly, and the toast would say so
    await expect(page.getByTestId("usage-task-t2")).toBeVisible();
    await page.getByTestId("usage-verb").click();
    await expectToast(page, "Copied · 3 rows");

    const csv = await page.evaluate(() => navigator.clipboard.readText());
    // `\r?\n`: the app writes "\n" (`tests/unit/usage.test.ts` pins the exact
    // bytes) and the WINDOWS clipboard hands them back as CRLF. That is the
    // platform normalising a text flavour on its way through, not the app
    // emitting a line ending per OS, so the reader tolerates both.
    const lines = csv.split(/\r?\n/);
    expect(lines[0]).toBe("taskId,subtaskId,agent,model,in,out,cost,at");
    expect(lines).toHaveLength(4);
    // raw numbers: this text is going into a spreadsheet
    expect(lines[1]).toContain(",ea,claude-haiku-4-5,4200,900,0.02,");
    expect(csv).not.toContain("$");
  });
});

/**
 * Stage 6 A-3 (S6-22) — five time forms in the Security card and "9 h ago"
 * in the feed. Every time on the tab goes through `formatWhen` now, the form
 * every other surface uses.
 */
test.describe("Stage 6 A-3 · one time form on the Agents tab", () => {
  test("the Security card and the feed write their times the way every other surface does", async ({ page }) => {
    await openAgents(page);
    // `[  ]`, not a literal space: A63-01 binds the card's instant with
    // NBSP so "Sat 5 Sep, 2:00am" cannot break after the 5, and a regex match
    // reads the characters as they are — Playwright normalises NBSP for a
    // STRING matcher and not for this one. What this case pins is the FORM —
    // short weekday, short month, no long month name, no "9 h ago" — and
    // which space holds the form together is not part of that claim; the feed,
    // matched against the same pattern below, is unbound and has real spaces.
    const when = /(Today|Yesterday|(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[  ]\d{1,2}[  ](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec),)[  ]\d{1,2}:\d{2}(am|pm)/;
    await expect(page.getByTestId("check-chk5")).toHaveText(when);
    await expect(page.getByTestId("check-chk5")).not.toHaveText(/January|February|March|April|May|June|July|August|September|October|November|December/);
    await expect(page.getByTestId("check-chk1")).toHaveText(when);
    await expect(page.getByTestId("feed-f3")).toHaveText(when);
    await expect(page.getByTestId("feed-f3")).not.toHaveText(/\d+ h ago/);
  });
});
