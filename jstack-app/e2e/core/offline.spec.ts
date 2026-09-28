/**
 * OF-02..08 (row O-2) — a dead connection, in the browser.
 *
 * The promise being tested is the one a person actually feels: they say
 * something into the app on a train, the tunnel eats the connection, and
 * nothing is lost. Everything here is a way that could quietly fail — a
 * capture that vanishes, a row that lies about having been sent, a queue that
 * forgets on reload, a verb that pretends to work.
 */
import { assertCleanConsole, expect, gotoTab, openUnlocked, store, test } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const rig = (page: import("@playwright/test").Page) => ({
  goOffline: () => page.evaluate(() => (window as any).__JSTACK__.goOffline()),
  goOnline: () => page.evaluate(() => (window as any).__JSTACK__.goOnline()),
  outbox: () => page.evaluate(() => (window as any).__JSTACK__.outbox()) as Promise<{ offlineId: string; path: string }[]>,
  forceConflict: (id: string) => page.evaluate((offlineId) => (window as any).__JSTACK__.forceConflict(offlineId), id),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

test.describe("OF-02 a capture made offline is kept and says so", () => {
  test("the row appears with the queued line and the queue holds one entry", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    await rig(page).goOffline();

    await page.getByTestId("dump-input").fill("something I thought of on the train");
    await page.getByTestId("dump-send").click();

    await expect.poll(async () => (await rig(page).outbox()).length).toBe(1);
    await expect(page.getByText("queued · syncs when you're back online").first()).toBeVisible();
    await expect(page.getByText("something I thought of on the train")).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("OF-06 the queue survives a reload", () => {
  test("the capture is still there after the app is torn down and rebuilt", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    await rig(page).goOffline();
    await page.getByTestId("dump-input").fill("survives a reload");
    await page.getByTestId("dump-send").click();
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(1);

    // NOT `context.setOffline` here. Without a service worker the page cannot
    // load at all offline, and the test build deliberately has none (P-1) —
    // the reload failed with ERR_INTERNET_DISCONNECTED, which proves nothing
    // about the queue. What OF-06 actually claims is that the QUEUE survives
    // the app being torn down and rebuilt, and that is IndexedDB's job.
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __JSTACK__?: unknown }).__JSTACK__ != null);

    // After the reload the app comes back believing it is online and drains
    // the queue on its own. Either state is the promise kept: still queued, or
    // already on the server. What must never be true is that it is neither.
    await expect
      .poll(async () => {
        const queued = (await rig(page).outbox()).length;
        const landed = ((await store(page, "brain")).latestIn ?? []) as { text: string }[];
        return queued > 0 || landed.some((i) => i.text === "survives a reload");
      })
      .toBe(true);
    assertCleanConsole(log);
  });
});

test.describe("OF-05 reconnecting", () => {
  test("replays, says how many, and the queued lines go", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    await rig(page).goOffline();
    for (const text of ["one", "two", "three"]) {
      await page.getByTestId("dump-input").fill(text);
      await page.getByTestId("dump-send").click();
    }
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(3);

    await rig(page).goOnline();
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(0);
    await expect(page.getByText("Synced · 3 captures")).toBeVisible();
    await expect(page.getByText("queued · syncs when you're back online")).toHaveCount(0);
    assertCleanConsole(log);
  });
});

test.describe("OF-07 a capture the server will not take", () => {
  test("is listed under Settings › Sync with the local text and the reason", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "brain");
    await rig(page).goOffline();
    await page.getByTestId("dump-input").fill("the words I do not want to lose");
    await page.getByTestId("dump-send").click();

    const [entry] = await rig(page).outbox();
    await rig(page).forceConflict(entry.offlineId);
    await rig(page).goOnline();

    await expect.poll(async () => ((await store(page, "sync")).conflicts as unknown[]).length).toBe(1);
    await page.evaluate(() => (window as unknown as { __JSTACK__: { stores: unknown } }) && undefined);
    // Rail on desktop, the header's icon on a phone — mutually exclusive by
    // viewport, the same pattern `e2e/core/settings.spec.ts` uses.
    const rail = page.getByTestId("rail-settings");
    if (await rail.count()) await rail.click();
    else await page.getByTestId("header").getByLabel("Settings").click();
    await page.getByTestId("settings-sync").click();
    await expect(page.getByText("the words I do not want to lose")).toBeVisible();
    await expect(page.getByTestId(`sync-conflict-${entry.offlineId}`)).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("OF-08 what offline changes on Today", () => {
  test("verbs are disabled with the reason, the health line says so, and the mic still queues", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "today");
    await rig(page).goOffline();

    // The deck shows one card's controls at a time, and it is not necessarily
    // needsYou[0] — asking for that id specifically waited 45 seconds for a
    // button that was never rendered.
    // The deck renders the OPEN card's controls, so the card has to be on
    // screen before the buttons exist. Going offline does not clear what was
    // already loaded — Today keeps its last good composite.
    const primary = page.getByTestId(/^decision-primary-/).first();
    await expect(primary).toBeVisible({ timeout: 15000 });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    // `force` because the button IS disabled — that is the assertion above.
    // The app's disabled buttons still take the tap and toast the reason
    // (theme/ui/controls.tsx's disabledReason contract); Playwright otherwise
    // waits forever for a control that is never going to be enabled.
    await primary.click({ force: true });
    await expect(page.getByText("needs a connection")).toBeVisible();

    // the health line lives in the rail on desktop and the header on a phone
    const health = (await page.getByTestId("rail-health").count()) > 0 ? page.getByTestId("rail-health") : page.getByTestId("header-health");
    await expect(health).toContainText("offline · captures queue");
    assertCleanConsole(log);
  });
});

/**
 * OF-03 (Josh's A-0 row 4): the other capture surfaces queue the same way,
 * each with its own optimistic state. Journal (Close the day), a habit
 * toggle, a task done, a People verb. "New task": no surface in this build
 * creates a task — the route is queueable (OF-01, `tests/unit/outbox.test.ts`)
 * and nothing calls it — so the browser proves the four that exist.
 */
test.describe("OF-03 every capture surface queues, with its own optimistic state", () => {
  test("journal, habit, task done and a People verb each queue and say so", async ({ page }) => {
    const log = await openUnlocked(page);
    await rig(page).goOffline();

    // task done — the checkbox flips at once and the write waits. T-3: t1 has
    // open subtasks, so the tick asks first; the capture is what happens after
    // the answer, which is the thing this case is about.
    await page.getByTestId("your-task-cb-t1").click();
    await page.getByTestId("complete-confirm-yes").click();
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(1);

    // a habit toggle, from Close the day's chips
    await page.getByTestId("close-habit-h1").click();
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(2);

    // the journal, through Close the day's Send
    await page.getByTestId("close-journal").fill("queued from the train");
    await page.getByTestId("close-day").getByLabel("Send").click();
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(3);

    // a People verb on Life
    await gotoTab(page, "life");
    await page.locator('[data-testid^="person-act-"]').first().click();
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(4);

    const paths = (await rig(page).outbox()).map((e) => e.path).sort();
    // T-3: a tick is `POST /tasks/{id}/complete` now, not a status PATCH —
    // one endpoint for one decision, and `offline: true` so it queues like
    // every other capture
    expect(paths.filter((p) => p !== "/people/pe1/act" && !p.startsWith("/people/"))).toEqual(["/habits/h1/log", "/journal", "/tasks/t1/complete"]);
    expect(paths.some((p) => /^\/people\/[^/]+\/act$/.test(p))).toBe(true);
    // and every one of them is the queued line somewhere on screen, not a
    // success line: the person sees "kept", never "sent"
    await expect(page.getByText("queued · syncs when you're back online").first()).toBeVisible();
    assertCleanConsole(log);
  });
});

/**
 * SY-02/SY-04 — the sync dot, in the three states it has and in the two places
 * it lives. One test rather than three because the states are a SEQUENCE the
 * app walks through: settled, then holding captures, then holding one the
 * server would not take. Asserting them in order is also the only way to catch
 * a dot that renders its first state and never updates, which is the failure a
 * per-state test would miss entirely.
 */
test.describe("SY-02/SY-04 the sync dot says what is waiting, and opens Settings › Sync", () => {
  test("ok → 2 captures waiting → needs attention, and a tap opens the sheet", async ({ page }) => {
    const log = await openUnlocked(page);
    const dot = page.getByTestId("sync-dot");
    await expect(dot).toBeVisible();

    // the pack's 6px dot, measured on the mark itself rather than on the
    // pressable around it: on the rail that pressable is a labelled row, and
    // on a phone it is a 36px tap area (GL-04), so neither box is the dot
    const mark = await dot.evaluate((el) => {
      const r = (el.querySelector("div") as HTMLElement).getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(mark).toEqual({ w: 6, h: 6 });

    // where it sits: above the health line on the rail, inside it on a phone
    if (await page.getByTestId("rail-health").count()) {
      await expect(page.getByTestId("rail").getByTestId("sync-dot")).toBeVisible();
      const dotBox = (await dot.boundingBox())!;
      const healthBox = (await page.getByTestId("rail-health").boundingBox())!;
      expect(dotBox.y + dotBox.height).toBeLessThanOrEqual(healthBox.y + 1);
      // S6-06 (ux round, Stage 6): the row was there on every desktop frame
      // and on none of them could it be seen. The demo watermark's desktop
      // offset was measured against a rail whose foot was the health line
      // alone (B-32), and its opaque chip sat exactly on this row.
      const mark = (await page.getByTestId("demo-watermark").boundingBox())!;
      const overlaps = mark.x < dotBox.x + dotBox.width && dotBox.x < mark.x + mark.width && mark.y < dotBox.y + dotBox.height && dotBox.y < mark.y + mark.height;
      expect({ markOverSyncRow: overlaps }).toEqual({ markOverSyncRow: false });
    } else {
      await expect(page.getByTestId("header-health").getByTestId("sync-dot")).toBeVisible();
      // S6-06: on the line's own grammar — a middle dot between every pair
      // (README Content) — DRAWN rather than typed, so the dot still
      // contributes no text (§4 A-114) and TD-02's exact-text pin holds
      await expect(page.getByTestId("header-health").getByTestId("health-sep")).toBeVisible();
    }

    await expect(dot).toHaveAttribute("aria-label", "Sync · ok");

    // two captures held offline — the label counts them, which is the number
    // Settings › Sync will list and the one a person can check
    await gotoTab(page, "brain");
    await rig(page).goOffline();
    for (const text of ["the first thing I said on the train", "and the second one"]) {
      await page.getByTestId("dump-input").fill(text);
      await page.getByTestId("dump-send").click();
    }
    await expect.poll(async () => (await rig(page).outbox()).length).toBe(2);
    await expect(dot).toHaveAttribute("aria-label", "Sync · 2 captures waiting");

    // one of them the server will not take: attention outranks the queue
    const [entry] = await rig(page).outbox();
    await rig(page).forceConflict(entry.offlineId);
    await rig(page).goOnline();
    await expect(dot).toHaveAttribute("aria-label", "Sync · needs attention");

    // SY-04
    await dot.click();
    await expect(page.getByTestId("sync-dialog")).toBeVisible();
    await expect(page.getByTestId(`sync-conflict-${entry.offlineId}`)).toBeVisible();
    assertCleanConsole(log);
  });
});

/**
 * Stage 6 A-3 (S6-19) — at 393 the Sync sheet's "COULD NOT BE APPLIED" hint
 * ran off the screen and was cut mid-word. A hint that does not fit beside
 * its label wraps under it, whole.
 */
test.describe("Stage 6 A-3 · a section label's hint never runs off the phone", () => {
  test("Sync's 'could not be applied' hint fits the viewport, wrapping under its label when it must", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");
    await rig(page).goOffline();
    await page.getByTestId("dump-input").fill("the words I do not want to lose");
    await page.getByTestId("dump-send").click();
    const [entry] = await rig(page).outbox();
    await rig(page).forceConflict(entry.offlineId);
    await rig(page).goOnline();
    await expect.poll(async () => ((await store(page, "sync")).conflicts as unknown[]).length).toBe(1);
    const rail = page.getByTestId("rail-settings");
    if (await rail.count()) await rail.click();
    else await page.getByTestId("header").getByLabel("Settings").click();
    await page.getByTestId("settings-sync").click();
    const hint = page.getByText("your words are kept here");
    await expect(hint).toBeVisible();
    const box = (await hint.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  });
});
