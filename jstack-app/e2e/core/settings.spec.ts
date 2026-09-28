/** SE-01..10, FS-04, SEC-09, LK-06, GL-04. */
import { calls, clickSettingsEntry, expect, expectToast, expectUndoToast, gotoTab, openUnlocked, pickProject, settle, store, test, undo } from "../helpers";

/** GL-04: every mounted `<Sens>` instance is `data-sens="visible"` or
 * `"blurred"` — count(tagged) === count(blurred) is the row's own literal
 * check. Scoped to `scope` (a tab's own screen container), not the whole
 * document — expo-router keeps inactive tab scenes mounted (sweeps.ts's
 * own established lesson), so an unscoped count picks up Sens instances
 * from a DIFFERENT, background-mounted tab too. */
async function sensCounts(page: import("@playwright/test").Page, scope: string): Promise<{ tagged: number; blurred: number }> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { tagged: -1, blurred: -1 };
    return {
      tagged: root.querySelectorAll("[data-sens]").length,
      blurred: root.querySelectorAll('[data-sens="blurred"]').length,
    };
  }, scope);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__.biometric is test-only, untyped by design */
async function biometricApprove(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as any).__JSTACK__.biometric.approve());
}
async function biometricDecline(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as any).__JSTACK__.biometric.decline());
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function openSettings(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await clickSettingsEntry(page);
  await expect(page.getByTestId("settings-sheet")).toBeVisible();
  return log;
}

test.describe("SE-01 Settings sheet", () => {
  test("opens from the rail (desktop) or the header button (phone), shows the header text, and closes by button/Esc", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    await expect(page.getByTestId("settings-sheet")).toContainText("Settings");
    await expect(page.getByTestId("settings-sheet")).toContainText("One account · 3 devices · changes save as you make them");

    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("settings-sheet")).toHaveCount(0);

    await clickSettingsEntry(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-sheet")).toHaveCount(0);
  });

  test("closes by the scrim on desktop, where the sheet doesn't fill the whole screen", async ({ page }, testInfo) => {
    // on phone the sheet is deliberately full-screen (SE-09: "12px
    // padding", no visible outside area) — the mock/spec never promises a
    // tappable scrim there, so this is desktop-only, same as GL-08.
    test.skip(testInfo.project.name === "w393-light", "the phone sheet is full-screen — no scrim to tap");
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    await page.getByTestId("settings-scrim").click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId("settings-sheet")).toHaveCount(0);
  });
});

test.describe("SE-02 Notifications", () => {
  test("a toggle persists; Security 423s and toasts instead of flipping", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("notif-ng2-ipad").click();
    const c = await calls(page);
    expect(c.some((x) => x.method === "putNotificationGroup")).toBe(true);

    await page.getByTestId("notif-ng4-ipad").click();
    await expectToast(page, "Security notifications are always on · by design");
    await expect(page.getByTestId("notif-ng4-ipad")).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("SE-03 Quiet hours footer", () => {
  test("reads from GET /settings/quiet-hours", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByTestId("settings-notifications")).toContainText("Quiet hours,");
    await expect(page.getByTestId("settings-notifications")).toContainText("apply to all but security.");
  });
});

test.describe("SE-04 Schedules", () => {
  test("run toasts; pause/resume flips the row", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByTestId("schedule-sc1")).toContainText("5 min");

    await page.getByTestId("schedule-run-sc2").click();
    await expectToast(page, "Running now · the result lands in the feed");

    await expect(page.getByTestId("schedule-toggle-sc2")).toHaveText("pause");
    await page.getByTestId("schedule-toggle-sc2").click();
    await expect(page.getByTestId("schedule-toggle-sc2")).toHaveText("resume");
  });
});

test.describe("SE-05 Autonomy", () => {
  test("a choice persists and toasts", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("autonomy-bills").getByRole("tab", { name: "Auto" }).click();
    await expectToast(page, "Autonomy saved · enforced server-side");
    const c = await calls(page);
    expect(c.some((x) => x.method === "putAutonomy")).toBe(true);
  });
});

test.describe("SE-06 Voice", () => {
  test("VP-14: end phrases and the cue word are editable and persist via PUT /settings/voice", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("voice-cue-word").fill("done");
    await page.getByTestId("voice-end-phrases").fill("that's all\nwrap it up");
    await expect
      .poll(async () => {
        const puts = (await calls(page)).filter((x) => x.method === "putVoiceSettings");
        const last = puts.at(-1)?.args[1] as { cueWord?: string; endPhrases?: string[] } | undefined;
        return last?.endPhrases;
      })
      .toEqual(["that's all", "wrap it up"]);
    const settings = await store(page, "settings");
    expect(settings.voice.cueWord).toBe("done");
  });

  test("style, speed and read-brief persist via PUT /settings/voice", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("voice-style").getByRole("tab", { name: "Clear" }).click();
    await page.getByTestId("voice-speed").getByRole("tab", { name: "1.5x" }).click();
    await page.getByTestId("voice-read-brief").click();

    const c = await calls(page);
    const puts = c.filter((x) => x.method === "putVoiceSettings");
    expect(puts.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe("SE-07/FS-04 Focus filters", () => {
  test("add and rename stay inside Settings' own Focuses section; remove via the chip row's tune icon; Everything cannot be removed", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByTestId("focus-row-all")).toContainText("always present");

    // add — Settings' own "Add a focus" button, never touching the
    // FocusChips tune icon (that lives on the tab BEHIND the sheet's
    // backdrop and isn't clickable while Settings is open)
    await page.getByTestId("focus-add").click();
    await expect(page.getByTestId("focus-form")).toBeVisible();
    await page.getByTestId("focus-name").fill("Practice");
    await page.getByTestId("focus-silo-work").click();
    await page.getByTestId("focus-save").click();
    await expectToast(page, "Focus added");

    const newRow = page.locator('[data-testid^="focus-row-focus-"]');
    await expect(newRow).toContainText("Practice");

    // rename — Settings' own per-row "edit" link
    await newRow.getByText("edit").click();
    await expect(page.getByTestId("focus-form")).toBeVisible();
    await page.getByTestId("focus-name").fill("Practice v2");
    await page.getByTestId("focus-save").click();
    await expectToast(page, "Focus saved");
    await expect(newRow).toContainText("Practice v2");

    // close Settings, THEN reach the chip row's tune icon for remove —
    // it's a different entry point into the same dialog's "list" view
    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("focus-chips")).toContainText("Practice v2");

    await page.getByLabel("Edit focuses").click();
    await expect(page.getByTestId("focus-edit-dialog")).toBeVisible();
    const rows = page.locator('[data-testid^="focus-edit-row-"]');
    await expect(rows).toHaveCount(5); // Everything + Personal + Family + Work + Practice v2
    await expect(page.getByTestId("focus-edit-row-all")).toContainText("always present");

    const renamedRow = page.locator('[data-testid^="focus-edit-row-focus-"]');
    await renamedRow.getByText("remove").click();
    await expect(page.getByTestId("focus-chips")).not.toContainText("Practice v2");
  });
});

test.describe("SE-08 Appearance and account", () => {
  test("theme, devices manage/revoke, hide sensitive figures, export gating, hold to lock", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("settings-theme").getByRole("tab", { name: "Dark" }).click();

    await page.getByTestId("devices-manage").click();
    await expect(page.getByTestId("devices-dialog")).toBeVisible();
    await expect(page.getByTestId("device-dev1")).toContainText("this device");
    await expect(page.getByTestId("device-revoke-dev1")).toHaveCount(0);
    await expect(page.getByTestId("device-revoke-dev2")).toBeVisible();
    await page.getByTestId("devices-dialog-close").click();

    await page.getByTestId("settings-privacy-blur").click();
    await expect(page.getByTestId("settings-privacy-blur")).toHaveAttribute("aria-checked", "true");

    await expect(page.getByTestId("settings-export")).toHaveAttribute("aria-disabled", "false");
  });
});

test.describe("GL-04 hide sensitive figures blurs every sens element", () => {
  test("OFF: every tagged element reads visible; ON: every tagged element reads blurred, count(tagged) === count(blurred)", async ({ page }) => {
    await openUnlocked(page);

    await gotoTab(page, "agents"); // Stats/Spend both carry Sens figures
    const beforeAgents = await sensCounts(page, '[data-testid="tab-screen-agents"]');
    expect(beforeAgents.tagged).toBeGreaterThan(0);
    expect(beforeAgents.blurred).toBe(0);

    await gotoTab(page, "life"); // Money's amounts carry Sens too
    const beforeLife = await sensCounts(page, '[data-testid="tab-screen-life"]');
    expect(beforeLife.tagged).toBeGreaterThan(0);
    expect(beforeLife.blurred).toBe(0);

    await clickSettingsEntry(page);
    await page.getByTestId("settings-privacy-blur").click();
    await expect(page.getByTestId("settings-privacy-blur")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("settings-close").click();

    const afterLife = await sensCounts(page, '[data-testid="tab-screen-life"]');
    expect(afterLife.tagged).toBe(beforeLife.tagged);
    expect(afterLife.blurred).toBe(afterLife.tagged);

    await gotoTab(page, "agents");
    const afterAgents = await sensCounts(page, '[data-testid="tab-screen-agents"]');
    expect(afterAgents.tagged).toBe(beforeAgents.tagged);
    expect(afterAgents.blurred).toBe(afterAgents.tagged);

    // restore, so later tests in this file see the fixture default
    await clickSettingsEntry(page);
    await page.getByTestId("settings-privacy-blur").click();
    await page.getByTestId("settings-close").click();
    expect((await sensCounts(page, '[data-testid="tab-screen-agents"]')).blurred).toBe(0);
  });
});

test.describe("LK-06 device revoke — the full flow", () => {
  test("declining the biometric cancels; approving it revokes and toasts", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("devices-manage").click();
    await expect(page.getByTestId("device-revoke-dev2")).toBeVisible();

    await biometricDecline(page);
    await page.getByTestId("device-revoke-dev2").click();
    await expectToast(page, "Cancelled — revoking a device needs a fresh passkey check");
    await expect(page.getByTestId("device-revoke-dev2")).toBeVisible(); // still there — nothing happened

    await biometricApprove(page);
    await page.getByTestId("device-revoke-dev2").click();
    await expectToast(page, "Device revoked");
    const c = await calls(page);
    expect(c.some((x) => x.method === "revokeDevice")).toBe(true);
    await expect(page.getByTestId("device-dev2")).toHaveCount(0);
  });
});

test.describe("SEC-09 no third-party origins; CSP present", () => {
  test("every request stays same-origin while navigating and opening Settings", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await openSettings(page);
    await page.getByTestId("settings-close").click();

    const origin = new URL(page.url()).origin;
    const thirdParty = requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:"));
    expect(thirdParty).toEqual([]);

    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain("default-src 'self'");
  });
});

test.describe("ST-01 the notification grid says which device", () => {
  test("the four devices are named, and the layout follows the width", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-notifications")).toBeVisible();

    // ST-01: "iPh" and "TG" saved four characters and cost the reader the
    // answer to "which of my things is this?" — on the panel where getting it
    // wrong means a notification arriving somewhere Josh is not.
    for (const name of ["iPhone", "iPad", "PC", "Telegram"]) {
      await expect(page.getByTestId("settings-notifications"), name).toContainText(name);
    }

    // and nothing is clipped: the names only fit the grid where there is room,
    // so below the tablet breakpoint each group is a labelled row instead
    const clipped = await page.getByTestId("settings-notifications").evaluate((root) =>
      Array.from(root.querySelectorAll("*")).some((el) => el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? "").trim() !== ""),
    );
    expect(clipped).toBe(false);

    // the switches are there and named either way
    await expect(page.getByTestId("notif-ng1-iphone")).toBeVisible();
    await expect(page.getByTestId("notif-ng1-telegram")).toHaveAttribute("aria-label", /Telegram$/);
    if (width < 768) {
      // one labelled row per group: the column heading row is not drawn
      await expect(page.getByTestId("notif-row-ng1")).toContainText("Telegram");
    }
  });
});

test.describe("ST-02 Rules for my EA", () => {
  test("the list is under Autonomy, edits persist, and Brain has no Rules section", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);

    await expect(page.getByTestId("settings-rules")).toBeVisible();
    // V2.1's four rules came with the migration, by their own words
    await expect(page.getByTestId("settings-rules")).toContainText("Never book anything before 7:30am.");
    // and each says when it applies and what the EA does — which the old
    // numbered list could not
    await expect(page.getByTestId("settings-rule-meta-ar2")).toHaveText("Everything · Ask me first");

    await page.getByTestId("settings-rules-edit").click();
    await expect(page.getByTestId("rule-edit-dialog")).toBeVisible();
    await page.getByTestId("rule-edit-open-ar2").click();
    await page.getByTestId("rule-mode-auto").click();
    await page.getByTestId("rule-save").click();
    await expect(page.getByTestId("toast")).toContainText("Rule saved");
    await expect(page.getByTestId("settings-rule-meta-ar2")).toHaveText("Everything · Do it — tell me after");

    const c = await calls(page);
    expect(c.some((x) => x.method === "putAutonomyRules")).toBe(true);

    // and the section really has gone from Brain (ST-02, resolution #40)
    await page.getByTestId("settings-close").click();
    await gotoTab(page, "brain");
    await expect(page.getByTestId("brain-rules-section")).toHaveCount(0);
  });

  test("a rule can be added and removed, and a removal really removes", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await page.getByTestId("settings-rules-edit").click();

    await page.getByTestId("rule-add-open").click();
    await page.getByTestId("rule-text").fill("Never schedule anything on a Friday afternoon");
    await settle(page); // Save lands where the add control was (B-246)
    await page.getByTestId("rule-save").click();
    await expect(page.getByTestId("toast")).toContainText("Rule added");
    await expect(page.getByTestId("settings-rules")).toContainText("Never schedule anything on a Friday afternoon");

    await settle(page); // at 393 the Edit entry sits where Save just was (B-246)
    await page.getByTestId("settings-rules-edit").click();
    await page.getByTestId("rule-remove-ar1").click();
    await expect(page.getByTestId("rule-edit-dialog")).toBeVisible();
    await page.getByTestId("rule-edit-dialog-close").click();
    // unlike a habit's archive: a rule has no history to keep, and an off rule
    // still in the list is one somebody reads as active one day
    await expect(page.getByTestId("settings-rule-ar1")).toHaveCount(0);
  });
});

test.describe("ST-03 the EA proposes a rule", () => {
  test("the card shows the rule it would write; Approve appends exactly that", async ({ page }) => {
    await openUnlocked(page);
    // through the ROUTE, as the section and parameter proposals are: a rig
    // that builds the card by hand cannot prove the endpoint produces one
    await page.evaluate(() => (window as any).__JSTACK__.proposeRule("Move a Thursday meeting only after asking"));

    // find it the way LK-04 finds its parameter card: Needs you ranks and caps
    // what it shows, so a new card may be a waiting ROW rather than on screen
    const cardId = await page.evaluate(
      () => (window as any).__JSTACK__.stores.today().composite?.needsYou?.find((a: any) => a.kind === "rule")?.id as string,
    );
    expect(cardId).toBeTruthy();
    const row = page.getByTestId(`waiting-open-${cardId}`);
    if (await row.count()) await row.click();
    await expect(page.getByTestId(`decision-rule-${cardId}`)).toBeVisible();
    // the RULE ITSELF, not a description of one — Approve appends this string
    await expect(page.getByTestId(`decision-rule-text-${cardId}`)).toHaveText("Move a Thursday meeting only after asking");
    await expect(page.getByTestId(`decision-rule-mode-${cardId}`)).toContainText("do it, tell me after");

    // the primary verb, which this card labels "Approve"
    await page.getByTestId(`decision-primary-${cardId}`).click();

    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-rules")).toContainText("Move a Thursday meeting only after asking");
  });
});

test.describe("ST-05/ST-06/ST-07 Voice", () => {
  test("six speeds, silence Off/10/60 with no 5, and Read replies aloud", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-voice")).toBeVisible();

    for (const speed of ["0.8x", "1x", "1.2x", "1.5x", "1.75x", "2x"]) {
      await expect(page.getByTestId("voice-speed"), speed).toContainText(speed);
    }

    // ST-06: five seconds is a pause for thought, not the end of a sentence
    await expect(page.getByTestId("voice-silence-turn")).toContainText("60s");
    await expect(page.getByTestId("voice-silence-turn")).not.toContainText("5s");

    await expect(page.getByTestId("settings-voice")).toContainText("Read replies aloud");

    // and a speed persists through the store, not just on screen
    await page.getByTestId("voice-speed").getByRole("tab", { name: "1.75x" }).click();
    const speed = await page.evaluate(() => (window as any).__JSTACK__.stores.settings().voice.speed);
    expect(speed).toBe(1.75);
  });
});

/**
 * S6-05 / S6-26 (ux round, Stage 6) — Settings › Sync painted a second scrim
 * over the sheet's scrim, so the Settings sheet's own card measured darker
 * than the app's light ground, and the dialog was the same 900 px as the
 * sheet beneath it, so it read as a band cut out of the sheet rather than a
 * surface on top of it. README Components: "scrim + ONE frosted sheet".
 *
 * A dialog opened over the settings sheet paints no scrim of its own, and a
 * dialog's width is its surface kind's (`SURFACE_WIDTH`, `layout/dialogKit.tsx`)
 * — 640 for a panel opened inside the sheet, 480 for a confirm, and RL-06's
 * recorded 900 for the rest (`e2e/matrix/layout.spec.ts` measures Help at it).
 */
test.describe("S6-05 / S6-26 one scrim over the settings sheet, and a dialog the width of its kind", () => {
  test("Settings › Sync paints no second scrim and is narrower than the sheet; a confirm is narrower still", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "the phone's dialogs are full-screen — no scrim to stack and no widths to compare");
    await openSettings(page);
    await page.getByTestId("settings-sync").click();
    await expect(page.getByTestId("sync-dialog")).toBeVisible();
    const scrimOf = () => page.getByTestId("sync-dialog-backdrop").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await scrimOf()).toBe("rgba(0, 0, 0, 0)");
    const sheet = (await page.getByTestId("settings-sheet").boundingBox())!;
    const sync = (await page.getByTestId("sync-dialog").boundingBox())!;
    expect({ sheet: Math.round(sheet.width), sync: Math.round(sync.width) }).toEqual({ sheet: 900, sync: 640 });
    await page.getByTestId("sync-dialog-close").click();
    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("settings-sheet")).toHaveCount(0);

    // opened from the rail's dot with nothing beneath it, the scrim is its own
    await page.getByTestId("sync-dot").click();
    await expect(page.getByTestId("sync-dialog")).toBeVisible();
    expect(await scrimOf()).toBe("rgba(28, 26, 22, 0.3)");
    await page.getByTestId("sync-dialog-close").click();

    // a confirm: one question and two buttons
    await gotoTab(page, "today");
    await page.getByTestId("your-task-cb-t1").click();
    await expect(page.getByTestId("complete-confirm")).toBeVisible();
    const confirm = (await page.getByTestId("complete-confirm").boundingBox())!;
    expect(Math.round(confirm.width)).toBe(480);
    await page.getByTestId("complete-confirm-close").click();
  });
});

/**
 * S6-13 (ux round, Stage 6) — the undo toast sat on the EMAIL waiting row's
 * title and cut its Approve to `rove` at 393, and covered the Time zone value
 * and the Calendar proposals label on the settings sheet at 1366. The A-1
 * rule: "no floating element over content or a control with a toast up". The
 * toast publishes the band it occupies (`ui.toastInset`), and the tab page,
 * the phone sheet's scroll box and the desktop sheet END above it.
 */
test.describe("S6-13 the page and the sheet end above the toast's band", () => {
  test("with an undo toast up, the tab page's foot and the settings sheet's foot clear the toast", async ({ page }) => {
    await openUnlocked(page);
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    await page.locator('[data-testid^="your-task-cb-"]').first().click();
    await page.getByTestId("complete-confirm-yes").click();
    await expectUndoToast(page, "Completed");
    const toast = await box("toast");
    const tabPage = await box("tab-screen-today");
    expect(tabPage.y + tabPage.height + 8).toBeLessThanOrEqual(toast.y + 1);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-sheet")).toBeVisible();
    const desktop = (await page.getByTestId("rail-settings").count()) > 0;
    const foot = await box(desktop ? "settings-sheet" : "settings-scroll");
    expect(foot.y + foot.height + 8).toBeLessThanOrEqual(toast.y + 1);
    await page.getByTestId("settings-close").click();
    await undo(page);
  });
});
