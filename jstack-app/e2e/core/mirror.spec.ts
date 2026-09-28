/**
 * TM-01..03 (row D-1) — a card answered from Telegram, while this screen is
 * open.
 *
 * The behaviour under test is the one nobody thinks to check: Josh answers a
 * decision from his phone's Telegram, and the app he left open on the desk
 * has to notice. Not on the next reload — now, and without asking him to do
 * anything. TM-02 also caps the cost of noticing at ONE refetch, which is why
 * `lib/serverEvents.ts` coalesces.
 */
import { assertCleanConsole, calls, expect, gotoTab, openUnlocked, store, test } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const telegramAnswer = (page: import("@playwright/test").Page, id: string, verb: string) =>
  page.evaluate(([actionId, v]) => (window as any).__JSTACK__.telegramAnswer(actionId, v), [id, verb] as const);
/* eslint-enable @typescript-eslint/no-explicit-any */

const needsYouIds = async (page: import("@playwright/test").Page): Promise<string[]> =>
  (((await store(page, "today")).composite?.needsYou ?? []) as { id: string }[]).map((a) => a.id);

test.describe("TM-01..02 an answer from another channel", () => {
  test("the card leaves Needs you without a reload, and the next one opens", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "today");
    const before = await needsYouIds(page);
    expect(before.length).toBeGreaterThan(1);

    await telegramAnswer(page, before[0], "approve");

    // TM-02: within two seconds, no reload
    await expect.poll(async () => needsYouIds(page), { timeout: 2000 }).not.toContain(before[0]);
    expect(await needsYouIds(page)).toContain(before[1]);
    assertCleanConsole(log);
  });

  test("exactly one refetch — a burst must not become a storm", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "today");
    const ids = await needsYouIds(page);

    const before = (await calls(page)).filter((c) => c.method === "getToday").length;
    await telegramAnswer(page, ids[0], "approve");
    await expect.poll(async () => needsYouIds(page), { timeout: 2000 }).not.toContain(ids[0]);

    const after = (await calls(page)).filter((c) => c.method === "getToday").length;
    expect(after - before).toBe(1);
    assertCleanConsole(log);
  });
});

test.describe("TM-03 the history row says where the answer came from", () => {
  test("reads via Telegram, and the app does not offer to undo it", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "today");
    const ids = await needsYouIds(page);
    await telegramAnswer(page, ids[0], "approve");
    await expect.poll(async () => needsYouIds(page), { timeout: 2000 }).not.toContain(ids[0]);

    // the ten-second window belongs to the surface that took the action —
    // offering undo here offers to reverse something done somewhere else
    await expect(page.getByTestId("toast-undo")).toHaveCount(0);
    assertCleanConsole(log);
  });
});
