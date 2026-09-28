/**
 * D2-01..04 (row D-1) — the morning after, in the browser.
 *
 * `tests/unit/day2.test.ts` proves the diff is applied correctly. What only a
 * browser shows is that the day-2 scene READS as a morning after: the delta
 * line says what happened overnight, the expired card is in history with its
 * then-what applied rather than simply gone, and the Later that came back is
 * waiting in Needs you.
 */
import { assertCleanConsole, expect, gotoTab, openUnlocked, store, test } from "../helpers";

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const seedDay2 = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__JSTACK__.reset("day2"));

test.describe("D2-01..02 the day-2 scene", () => {
  test("the delta line says what happened while he was away (OF-09's delta line; the `?since=` half is CARRIED_DEFECTS_v21 OF-A)", async ({ page }) => {
    const log = await openUnlocked(page);
    await seedDay2(page);
    await gotoTab(page, "today");

    await expect
      .poll(async () => (await store(page, "today")).composite?.since)
      .toMatch(/^Since yesterday: 3 things landed/);
    assertCleanConsole(log);
  });

  test("the expired card is in history, answered by its own then-what", async ({ page }) => {
    const log = await openUnlocked(page);
    await seedDay2(page);
    await gotoTab(page, "today");

    // Decision history is the AGENTS store's (it owns answered and expired
    // cards; Today carries only the open ones) AND it has its own loader —
    // `load()` does not fetch it, so polling the store forever would never
    // have seen anything.
    // `components/agents/History.tsx` calls `loadHistory()` on mount, so
    // opening the tab is what fetches it — there is no store action to poll
    // before something has asked for it.
    await gotoTab(page, "agents");
    await expect
      .poll(async () => {
        const actions = ((await store(page, "agents")).history ?? []) as { id: string; history?: { via: string }[] }[];
        return actions.find((a) => a.id === "c1")?.history?.at(-1)?.via;
      })
      .toBe("expiry");
    assertCleanConsole(log);
  });

  test("the Later card came back and is waiting", async ({ page }) => {
    const log = await openUnlocked(page);
    await seedDay2(page);
    await gotoTab(page, "today");

    await expect
      .poll(async () => {
        const needs = (await store(page, "today")).composite?.needsYou as { id: string }[] | undefined;
        return needs?.some((a) => a.id === "c3");
      })
      .toBe(true);
    assertCleanConsole(log);
  });
});

test.describe("D2-04 the overnight subtask", () => {
  test("is done, with the cost and the EA's report on the task", async ({ page }) => {
    const log = await openUnlocked(page);
    await seedDay2(page);
    await gotoTab(page, "tasks");

    await expect
      .poll(async () => {
        const tasks = ((await store(page, "tasks")).list ?? []) as { id: string; report?: { summary: string } }[];
        return tasks.find((t) => t.id === "t1")?.report?.summary;
      })
      .toBe("Bundaberg memo drafted");
    assertCleanConsole(log);
  });
});
