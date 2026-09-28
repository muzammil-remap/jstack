/** LK-01..03, SEC-03, SEC-11 (row 6) + AG-11/AG-12, LK-04/LK-05 (row 15). */
import { assertCleanConsole, clickSettingsEntry, db, expect, expectToast, gotoTab, openApp, openUnlocked, test, undo, unlock } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__.biometric/getAdapter are test-only, untyped by design */
async function biometricApprove(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as any).__JSTACK__.biometric.approve());
}
async function biometricDecline(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as any).__JSTACK__.biometric.decline());
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** the event a real background/foreground transition fires (LK-01). */
async function hide(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}


test.describe("LK-01 locked screen", () => {
  test("shows 'Locked. Unlock with your passkey.' text and nothing behind it is reachable", async ({ page }) => {
    const log = await openApp(page);
    await expect(page.getByText(/Locked/i)).toBeVisible();
    // nothing behind the gate is clickable — the backdrop is fully opaque
    // and covers the viewport, so a tab bar tap (if it existed underneath)
    // would hit the gate instead
    const gateBox = await page.getByTestId("facelock").boundingBox();
    expect(gateBox?.width).toBeGreaterThan(300);
    assertCleanConsole(log);
  });

  // B7-01. The test above is the whole of what "nothing behind it is
  // reachable" used to mean here: the gate's box is big. A box stops a
  // pointer. It does not stop a Tab key, and until lib/webInert.ts the
  // keyboard walked straight past the gate into the app and could write
  // through the adapter from behind it. This test is the same claim asked of
  // the keyboard, and it fails on the commit before the fix.
  test("nothing behind it is reachable — 45 Tab presses never leave the gate, and Enter cannot write", async ({ page }) => {
    const log = await openApp(page);
    await expect(page.getByTestId("facelock")).toBeVisible();
    const statusOf = async () => ((await db(page)).tasks as { id: string; status: string }[]).find((t) => t.id === "t1")?.status;
    const before = await statusOf();

    const escaped: string[] = [];
    for (let i = 0; i < 45; i += 1) {
      await page.keyboard.press("Tab");
      const outside = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el == null || el === document.body || el === document.documentElement) return null;
        const gate = document.querySelector('[data-testid="facelock"]');
        if (gate != null && gate.contains(el)) return null;
        return el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.tagName;
      });
      if (outside != null) escaped.push(outside);
    }
    expect(escaped).toEqual([]);

    // and the key that would have fired whatever focus had reached
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    expect(await statusOf()).toBe(before);
    assertCleanConsole(log);
  });

  // B8-01. The test above walks the tab order of a COLD app, and `openApp`
  // opens one — so it could not see the one control that only exists after
  // you have done something: the undo toast. Its host was outside the inert
  // wrapper, so a task toggled, an auto-lock, and one Tab put Enter on
  // `toast-undo`, which wrote through the adapter from behind the gate.
  //
  // This asserts the COMPLEMENT rather than a walk: enumerate every
  // focusable element on the page and require all of them to be inside the
  // gate. A walk can only find what it happens to reach; the complement
  // cannot miss a control it did not think of.
  test("nothing focusable exists outside the gate — including the undo toast, which only exists after an action", async ({ page }) => {
    const log = await openUnlocked(page);
    // the tick is a MEANS here — any undoable action would do — and T-3 made
    // t1's tick ask first, because it has open subtasks
    await page.getByTestId("your-task-cb-t1").click();
    await page.getByTestId("complete-confirm-yes").click();
    await expect(page.getByTestId("toast-undo")).toBeVisible({ timeout: 10000 });
    const doneStatus = async () => ((await db(page)).tasks as { id: string; status: string }[]).find((t) => t.id === "t1")?.status;
    expect(await doneStatus()).toBe("done");

    // SEC-03's own lock path, with the toast still up. The INACTIVITY timer,
    // not a tab hide: L-1 made hiding a desktop tab a no-op (ADR-41), so the
    // hide this test used to lock with stopped locking anything at 1366 and
    // the assertion below ran against an unlocked app. The claim is unchanged
    // — nothing focusable outside the gate — only the way it gets there.
    await page.evaluate(() => (window as any).__JSTACK__.setAutoLockMs(300));
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 8000 });

    const outside = await page.evaluate(() => {
      const gate = document.querySelector('[data-testid="facelock"]');
      const sel = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"]';
      return [...document.querySelectorAll(sel)]
        .filter((el) => gate == null || !gate.contains(el))
        // `inert` does not hide an element or remove it from the DOM — it
        // makes it unreachable. So the question is not "is it there" but
        // "is it inside the subtree that is switched off", and anything
        // that is neither in the gate nor inside an inert subtree is a
        // control a locked app is still offering.
        .filter((el) => el.closest("[inert]") == null)
        .filter((el) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0)
        .map((el) => el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.tagName);
    });
    expect(outside).toEqual([]);

    // and the write that was reachable stays unmade
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(await doneStatus()).toBe("done");
    assertCleanConsole(log);
  });

  test("the app content carries inert while locked and loses it on unlock", async ({ page }) => {
    await openApp(page);
    const inertCount = () => page.locator("[inert]").count();
    expect(await inertCount()).toBe(1);
    await unlock(page);
    await expect(page.getByTestId("tab-today")).toBeVisible({ timeout: 15000 });
    expect(await inertCount()).toBe(0);
  });
});

test.describe("LK-02/SEC-03 auto-lock", () => {
  test("__JSTACK__.setAutoLockMs shortens the real timer and it fires", async ({ page }) => {
    await openUnlocked(page);
    await page.evaluate(() => (window as any).__JSTACK__.setAutoLockMs(300));
    await page.waitForTimeout(600);
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 4000 });
  });

  /**
   * L-1 (ADR-41) — this used to read "a visibility hide locks", full stop, and
   * that was the complaint: on a laptop it meant a passkey prompt every time
   * Josh looked at another window. The rule now depends on the device, so the
   * test does too, and it asserts the OPPOSITE thing at each width rather than
   * skipping the one it finds inconvenient.
   */
  test("hiding locks a phone at once and does not lock a desktop (LK-01)", async ({ page }, testInfo) => {
    const touch = testInfo.project.name.startsWith("w393");
    await openUnlocked(page);
    // Chromium's real tab-visibility semantics under Playwright (context.
    // newPage() to "background" the first tab) are inconsistent headless —
    // dispatch the same visibilitychange event lib/autoLock.ts listens for
    // directly, which is what a real background/foreground transition fires.
    await hide(page);

    if (touch) {
      await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 4000 });
    } else {
      // a negative needs a window to be false in, or it passes on being early
      await page.waitForTimeout(1000);
      await expect(page.getByTestId("facelock")).toHaveCount(0);
      await expect(page.getByTestId("tab-today")).toBeVisible();
    }
  });

  /**
   * The desktop's other half: it locks on the CLOCK, hidden or not. The real
   * ten minutes is `tests/unit/autoLock.test.ts`'s (fake timers); here the rig
   * shortens the window so the same code path can be driven for real, and the
   * tab is hidden for it — proving the timer kept counting rather than being
   * cancelled or re-armed by the visibility change.
   */
  test("a desktop's timer runs THROUGH the hidden time (LK-01)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("w393"), "a phone locks on hide before any timer can be observed");
    await openUnlocked(page);
    await page.evaluate(() => (window as any).__JSTACK__.setAutoLockMs(700));
    await hide(page);
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 5000 });
  });
});

/**
 * LK-03/LK-04 — the parameters card in Settings, and the card the EA raises.
 *
 * Both halves are asserted on the STORE as well as the screen: a control that
 * renders "30" having sent nothing is exactly the failure a screen-only
 * assertion cannot see.
 */
test.describe("LK-03/LK-04 parameters", () => {
  const paramValue = async (page: import("@playwright/test").Page, key: string) =>
    page.evaluate((k) => (window as any).__JSTACK__.stores.parameters().parameters.find((p: any) => p.key === k)?.value, key);

  test("Settings shows the six, a common value is one tap, and the server's refusal is shown honestly (LK-03)", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("settings-security")).toBeVisible();
    // one row per parameter, from the table — not a hand-written list
    await expect(page.locator('[data-testid^="param-row-"]')).toHaveCount(6);

    // the Seg: one tap for a common value, and the store actually moved
    await page.getByTestId("param-seg-lock.afterMinutes").getByText("30", { exact: true }).click();
    await expect.poll(() => paramValue(page, "lock.afterMinutes")).toBe(30);

    // and a value outside the published range: refused by the SERVER, said
    // out loud under the control, with the old value still in force
    const field = page.getByTestId("param-field-lock.afterMinutes");
    await field.fill("90");
    await field.press("Enter");
    await expect(page.getByTestId("param-error-lock.afterMinutes")).toContainText("between 1 and 60");
    await expect.poll(() => paramValue(page, "lock.afterMinutes")).toBe(30);

    // a legal value clears the line and sticks
    await field.fill("15");
    await field.press("Enter");
    await expect(page.getByTestId("param-error-lock.afterMinutes")).toHaveCount(0);
    await expect.poll(() => paramValue(page, "lock.afterMinutes")).toBe(15);
  });

  test("the boolean is a switch, and it is the one that governs locking on hide (LK-03)", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await page.getByTestId("param-switch-lock.lockOnHideTouch").click();
    await expect.poll(() => paramValue(page, "lock.lockOnHideTouch")).toBe(false);
  });

  test("an EA proposal is a card, and approving it is what changes the setting (LK-04)", async ({ page }) => {
    await openUnlocked(page);
    // through the rig, which reloads the two stores the card and the value
    // live in. NOT a page reload: the mock's db is rebuilt from its fixture on
    // every page load, so reloading would throw the proposal away and the test
    // would be waiting for a card the server no longer has.
    await page.evaluate(() => (window as any).__JSTACK__.proposeParameter("lock.afterMinutes", 20, "You unlock four times an hour on Tuesdays."));
    // nothing has changed yet — that is the whole point of the flow
    expect(await paramValue(page, "lock.afterMinutes")).toBe(10);
    const card = await page.evaluate(
      () => (window as any).__JSTACK__.stores.today().composite?.needsYou?.find((a: any) => a.kind === "parameter")?.id as string,
    );
    expect(card).toBeTruthy();

    const row = page.getByTestId(`waiting-open-${card}`);
    if (await row.count()) await row.click();
    await expect(page.getByTestId(`decision-parameter-${card}`)).toBeVisible();
    await expect(page.getByTestId(`decision-parameter-current-${card}`)).toHaveText("10");
    await expect(page.getByTestId(`decision-parameter-proposed-${card}`)).toHaveText("20");

    await page.getByTestId(`decision-primary-${card}`).click();
    await expect.poll(() => paramValue(page, "lock.afterMinutes")).toBe(20);

    // ...and UNDOING it is what changes the setting back. LK-04's row says
    // "with the ten-second undo", and until B-174 this half was never driven:
    // the server reverted to 10 and the DEVICE kept 20, so it auto-locked ten
    // minutes later than the person had chosen, silently, until a reload. The
    // store is the device's own answer; Settings is what the person reads.
    await undo(page);
    await expect.poll(() => paramValue(page, "lock.afterMinutes")).toBe(10);
    await clickSettingsEntry(page);
    await expect(page.getByTestId("param-field-lock.afterMinutes")).toHaveValue("10");
  });
});

test.describe("LK-03/SEC-11 deep link while locked, unknown route", () => {
  test("a route opened while locked shows the gate first, then lands on the route", async ({ page }) => {
    const log = await openApp(page);
    await page.goto("/tasks");
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("facelock").click();
    await expect(page.getByTestId("facelock")).toHaveCount(0);
    await expect(page.getByTestId("tab-tasks")).toHaveAttribute("aria-selected", "true");
    assertCleanConsole(log);
  });

  test("an unknown route drops to Today with a toast", async ({ page }) => {
    await openUnlocked(page);
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByTestId("tab-today")).toHaveAttribute("aria-selected", "true", { timeout: 15000 });
    await expect(page.getByTestId("toast")).toContainText("Link dropped", { timeout: 4000 });
  });
});

test.describe("AG-11 Emergency — hold to lock", () => {
  test("the hint changes while holding; an early release resets it", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "agents");
    await expect(page.getByTestId("hold-hint")).toContainText("Press and hold for 1.2 seconds.");

    // on w393-light (single-column phone layout) Emergency is the last
    // section, off-screen until scrolled — boundingBox() alone doesn't
    // scroll, so a raw click there misses the real button
    await page.getByTestId("hold-to-lock").scrollIntoViewIfNeeded();
    const box = await page.getByTestId("hold-to-lock").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await expect(page.getByTestId("hold-hint")).toContainText("Keep holding…");
    await page.mouse.up();
    await expect(page.getByTestId("hold-hint")).toContainText("Press and hold for 1.2 seconds.");
    await expect(page.getByTestId("emergency-confirm")).toHaveCount(0);
  });

  test("AG-04: the hint returns to rest after a completed hold, and after the dialog is cancelled", async ({ page }) => {
    // THE DEFECT: `cancelHold` did nothing once the timer had fired, so the
    // release that follows every SUCCESSFUL hold found nothing to cancel and
    // the control read "Locking…" for good — on the one control in the app
    // whose completion revokes every session.
    await openUnlocked(page);
    await gotoTab(page, "agents");
    await page.getByTestId("hold-to-lock").scrollIntoViewIfNeeded();
    const box = await page.getByTestId("hold-to-lock").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();

    await expect(page.getByTestId("emergency-confirm")).toBeVisible();
    // cancelling the dialog puts the control back — the dialog going away is a
    // different event from the finger coming off, and both have to reach it
    await page.getByTestId("emergency-confirm-close").click();
    await expect(page.getByTestId("emergency-confirm")).toHaveCount(0);
    await expect(page.getByTestId("hold-hint")).toHaveText("Press and hold for 1.2 seconds.");

    // and it still works: a control left in a stuck state is one you cannot
    // use twice, which on this control matters more than on any other
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();
    await expect(page.getByTestId("emergency-confirm")).toBeVisible();
  });

  test("holding the full 1.2s opens the confirm dialog with four rows", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "agents");
    await page.getByTestId("hold-to-lock").scrollIntoViewIfNeeded();
    const box = await page.getByTestId("hold-to-lock").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();

    await expect(page.getByTestId("emergency-confirm")).toBeVisible();
    await expect(page.getByTestId("emergency-confirm")).toContainText("Every session and token revoked");
    await expect(page.getByTestId("emergency-confirm")).toContainText("Vault frozen · agents paused · outbound tools disabled");
    await expect(page.getByTestId("emergency-confirm")).toContainText("Memory and databases untouched");
    await expect(page.getByTestId("emergency-confirm")).toContainText("Recovery needs your passkey and recovery key");
  });
});

test.describe("AG-12/LK-04/LK-05 Confirm, lock, and recover", () => {
  test("declining the biometric changes nothing; confirming locks, revokes the session, and shows the emergency screen", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "agents");
    await page.getByTestId("hold-to-lock").hover();
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();

    await biometricDecline(page);
    await page.getByTestId("emergency-lock-go").click();
    await expectToast(page, "Cancelled — the emergency lock needs a fresh passkey check");
    await expect(page.getByTestId("facelock")).toHaveCount(0);
    // declining leaves the dialog open for another attempt (same pattern as
    // CapsDialog) — no need to redo the 1.2s hold
    await expect(page.getByTestId("emergency-confirm")).toBeVisible();

    await biometricApprove(page);
    await page.getByTestId("emergency-lock-go").click();

    await expect(page.getByTestId("locked-emergency")).toBeVisible({ timeout: 4000 });
    await expect(page.getByTestId("locked-emergency")).toContainText("Every session and token is revoked");

    // LK-04: GET /session 401s once locked
    const status = await page.evaluate(async () => {
      const g = window as unknown as { __JSTACK__: { getAdapter: () => { getSession: () => Promise<unknown> } } };
      try {
        await g.__JSTACK__.getAdapter().getSession();
        return "ok";
      } catch (e) {
        return (e as { status?: number }).status ?? "error";
      }
    });
    expect(status).toBe(401);
  });

  test("Recover needs the passkey and the recovery key; success restores the session", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "agents");
    await page.getByTestId("hold-to-lock").hover();
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();
    await biometricApprove(page);
    await page.getByTestId("emergency-lock-go").click();
    await expect(page.getByTestId("locked-emergency")).toBeVisible({ timeout: 4000 });

    await page.getByTestId("recover-open").click();
    await expect(page.getByTestId("recovery-key")).toBeVisible();
    await page.getByTestId("recovery-key").fill("rk-test-1234");
    await biometricApprove(page);
    await page.getByTestId("recover-confirm").click();

    await expectToast(page, "Secrets rotated · your session restored · agents resuming one at a time");
    await expect(page.getByTestId("locked-emergency")).toHaveCount(0);
    await expect(page.getByTestId("facelock")).toHaveCount(0);

    // the server-side revoke from LK-04 is lifted too — GET /session works again
    const status = await page.evaluate(async () => {
      const g = window as unknown as { __JSTACK__: { getAdapter: () => { getSession: () => Promise<unknown> } } };
      try {
        await g.__JSTACK__.getAdapter().getSession();
        return "ok";
      } catch (e) {
        return (e as { status?: number }).status ?? "error";
      }
    });
    expect(status).toBe("ok");
  });
});

/**
 * SEC-02 (Josh's A-0 row 5): a browser with no WebAuthn gets an honest
 * sentence before any tap, and a tap runs no ceremony. Before, the gate
 * assumed availability and showed whatever the failed ceremony threw.
 */
test.describe("SEC-02 the gate says when there is no passkey support", () => {
  test("no PublicKeyCredential: the locked screen says so at once, stays locked on a tap, and logs no error", async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    });
    await openApp(page);
    await expect(page.getByTestId("gate-message")).toContainText("no passkey support");
    await page.getByTestId("facelock").click();
    await expect(page.getByTestId("facelock")).toBeVisible();
    await expect(page.getByTestId("gate-message")).toContainText("no passkey support");
  });
});

/**
 * S6-01 (ux round, Stage 6) — the reviewer read an empty lock screen off
 * sixteen frames: the block's ink began at y 1226 of a 2561-tall frame at 393.
 * That height is the Today page's, not the window's. The capture rig grows the
 * viewport to the tallest inner scroller before a full-page shot, and the tab
 * behind the gate is still mounted (`tools/capture-v2.mjs`, `shot()`) — B-35's
 * class: "check whether you are looking at a defect in the APP or in the
 * FRAME". This is the same claim asked of a real window at both widths: at
 * scroll 0 the gate IS the window, and everything on it is inside it.
 */
test.describe("S6-01 the locked screen is on screen at scroll 0", () => {
  test("the gate is the window's size, and the wordmark, the line and the button are all inside it", async ({ page }) => {
    await openApp(page);
    const vp = page.viewportSize()!;
    const gate = (await page.getByTestId("facelock").boundingBox())!;
    expect({ w: Math.round(gate.width), h: Math.round(gate.height), x: Math.round(gate.x), y: Math.round(gate.y) }).toEqual({ w: vp.width, h: vp.height, x: 0, y: 0 });
    for (const target of [page.getByTestId("facelock").getByText("JSTACK"), page.getByText("Locked. Unlock with your passkey."), page.getByTestId("unlock-btn")]) {
      const box = (await target.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    }
    // nothing scrolls the document itself — RNW scrolls an inner box, so there
    // is no taller page for the gate to be centred in
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  });
});
