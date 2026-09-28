/**
 * CL-01..CL-03 — collapsible section headings, in a real browser.
 *
 * The store half of H-1 is `tests/unit/collapse.test.ts` and the rendered half
 * is `tests/native/collapse.test.tsx`; neither can answer the two questions
 * that only the web build can. First, PERSISTENCE across a real reload — the
 * map goes through `encryptedStore` into this origin's storage, and a unit test
 * asserting `hydrateLocal()` is asserting a function call, not that the state
 * survived the browser. Second, the KEYBOARD: `accessibilityRole="button"` is a
 * promise that Enter and Space do what a tap does, and on react-native-web that
 * promise is kept (or not) by the DOM, which no native-renderer test sees.
 *
 * Collapsing is deliberately NOT the same feature as Arrange's hiding, and the
 * last test here is the one that says so: hidden is "not in my app", collapsed
 * is "here, and I know what is in it, and I am not looking right now".
 */
import type { Page } from "@playwright/test";
import { expect, gotoTab, openUnlocked, store, test, type Tab } from "../helpers";
import { horizontalScrollViolations, overlapViolations } from "../lib/sweeps";

/** a reload that lands back in the app: the gate always returns (GL-02). */
async function reloadAndUnlock(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("facelock").click();
  await expect(page.getByTestId("facelock")).toHaveCount(0);
  await expect(page.getByTestId("tab-today")).toBeVisible({ timeout: 15000 });
}

test.describe("CL-01 every heading discloses, and everything starts open", () => {
  test("every section on Today has a disclosure, expanded, with a 36px target", async ({ page }) => {
    await openUnlocked(page);

    // the whole tab, not a sample: a section added later without a sectionId
    // fails this rather than quietly shipping the one heading you cannot close.
    for (const id of ["needs-you", "insight", "calendar", "your-tasks", "glance", "close-day"]) {
      const control = page.getByTestId(`disclose-${id}`);
      await expect(control, `${id} has no disclosure`).toBeVisible();
      await expect(control).toHaveAttribute("aria-expanded", "true");
      const box = await control.boundingBox();
      expect(box, `${id} disclosure has no box`).not.toBeNull();
      // 36, not CL-01's 32: GL-05's phone floor is 36 for every interactive
      // element and it sweeps this control like any other (A-14)
      expect(box!.width).toBeGreaterThanOrEqual(36);
      expect(box!.height).toBeGreaterThanOrEqual(36);
    }

    // CL-01 says static AND configured. Life's sections are config records
    // rendered by SectionRenderer, which is a different code path entirely.
    await gotoTab(page, "life");
    await expect(page.getByTestId("disclose-habits")).toBeVisible();
    await expect(page.getByTestId("disclose-people")).toBeVisible();
    await expect(page.getByTestId("disclose-people")).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("CL-02 collapsing leaves the heading, the badge and the link", () => {
  test("the body goes, the heading stays, and it comes back", async ({ page }) => {
    await openUnlocked(page);
    await expect(page.getByTestId("needs-you-endline")).toBeVisible();

    await page.getByTestId("disclose-needs-you").click();

    // the body is gone…
    await expect(page.getByTestId("needs-you-endline")).toHaveCount(0);
    // …and everything that makes the section findable is still here. This is
    // the entire difference between collapsing and hiding.
    await expect(page.getByTestId("needs-you-label")).toBeVisible();
    await expect(page.getByTestId("needs-you-label")).toContainText("Needs you");
    await expect(page.getByTestId("needs-you-history")).toBeVisible();
    await expect(page.getByTestId("disclose-needs-you")).toHaveAttribute("aria-expanded", "false");

    await page.getByTestId("disclose-needs-you").click();
    await expect(page.getByTestId("needs-you-endline")).toBeVisible();
    await expect(page.getByTestId("disclose-needs-you")).toHaveAttribute("aria-expanded", "true");
  });

  test("the keyboard works — Enter and Space both toggle", async ({ page }) => {
    await openUnlocked(page);
    const control = page.getByTestId("disclose-glance");

    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("glance-goals")).toHaveCount(0);
    await expect(control).toHaveAttribute("aria-expanded", "false");

    // focus must survive the toggle, or a keyboard user who collapses a section
    // is dropped back at the top of the document
    await expect(control).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("glance-goals")).toBeVisible();
    await expect(control).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("CL-03 it survives a reload, and it is not hiding", () => {
  test("two collapsed sections stay collapsed; their neighbours do not move", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("disclose-glance").click();
    await page.getByTestId("disclose-close-day").click();
    await expect(page.getByTestId("glance-goals")).toHaveCount(0);
    await expect(page.getByTestId("close-journal")).toHaveCount(0);

    await reloadAndUnlock(page);

    await expect(page.getByTestId("disclose-glance")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("glance-goals")).toHaveCount(0);
    await expect(page.getByTestId("disclose-close-day")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("close-journal")).toHaveCount(0);

    // the neighbours are untouched — the map is per-section, not per-tab
    await expect(page.getByTestId("disclose-needs-you")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("needs-you-endline")).toBeVisible();
    await gotoTab(page, "brain");
    await expect(page.getByTestId("disclose-memory")).toHaveAttribute("aria-expanded", "true");
  });

  test("the state is the device's, not the account's — it never leaves the phone", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("disclose-glance").click();
    await expect.poll(async () => (await store(page, "device")).collapsed).toEqual({ glance: true });

    // Arrange's order/hidden go to the server (PUT /layout/today); this does
    // not, and must not: which sections I have folded shut on this laptop is
    // not a fact about my account.
    const layout = (await store(page, "settings")).layouts.today;
    expect(layout.hidden ?? []).not.toContain("glance");
    expect(JSON.stringify(layout)).not.toContain("collapsed");
  });

  test("a hidden section stays hidden, collapsed or not", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w393-light", "Arrange is desktop-only, RL-05");
    await openUnlocked(page);

    await page.getByTestId("disclose-glance").click();
    await expect(page.getByTestId("disclose-glance")).toHaveAttribute("aria-expanded", "false");

    await page.getByTestId("header").getByLabel("Arrange").click();
    await page.getByTestId("arrange-hide-glance").click();
    await expect.poll(async () => (await store(page, "settings")).layouts.today.hidden).toContain("glance");
    await page.getByTestId("arrange-dialog-close").click();

    // hidden beats collapsed: the heading is gone too, so there is nothing left
    // to expand, and a collapsed section cannot resurrect a hidden one.
    await expect(page.getByTestId("glance-label")).toHaveCount(0);
    await expect(page.getByTestId("disclose-glance")).toHaveCount(0);

    // No reload here, deliberately. Hiding is SERVER state (PUT /layout/today)
    // and the mock's db is rebuilt from its fixture on every page load, so a
    // reload would test the mock's memory, not the app's — and would pass or
    // fail for a reason that has nothing to do with H-1. The reload that
    // matters is on the collapsed map, which is device-local, and it is the
    // test above.

    // Showing it again returns it exactly as it was left: collapsed. Hiding
    // does not clear the fold, and unhiding does not undo it.
    await page.getByTestId("header").getByLabel("Arrange").click();
    await page.getByTestId("arrange-hide-glance").click();
    await page.getByTestId("arrange-dialog-close").click();
    await expect(page.getByTestId("disclose-glance")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("glance-goals")).toHaveCount(0);
  });
});

/**
 * JQ-06 (Josh, 8 Sep) — "when I collapse the 'Waiting on' subheading, it hides
 * the Gantt."
 *
 * Reproduced on the post-G-1 tree before it was fixed, per the planner's orders
 * §3: collapsing one section must never hide another.
 */
test.describe("JQ-06 collapsing one section never hides another", () => {
  test("the Gantt survives collapsing Waiting on", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    await page.getByTestId("task-seg").getByRole("tab", { name: "Gantt" }).click();
    const gantt = page.getByTestId("task-views").getByTestId("gantt");
    await expect(gantt.getByTestId("gantt-axis")).toBeVisible();
    const before = (await gantt.boundingBox())!;

    await page.getByTestId("waiting-on-label").getByRole("button").first().click();

    // the section it collapsed is gone; the Gantt is not
    await expect(gantt.getByTestId("gantt-axis")).toBeVisible();
    await expect(gantt.getByTestId("gantt-bar-t1")).toBeVisible();
    const after = (await gantt.boundingBox())!;
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
  });
});

/**
 * S6-42 (ux round 2, Stage 6) — the frame Josh's JQ-06 asked for showed the
 * mini Gantt card AND its heading gone when Waiting on collapsed: the card
 * lived inside that section, so it was never a section of its own, and the
 * same was true of Today's Calendar list. BRAIN_PROPOSAL: "Every section
 * heading on every tab gets a small triangle".
 */
test.describe("S6-42 the mini Gantt and the Calendar list are sections of their own", () => {
  test("collapsing Waiting on keeps the Gantt heading and card; both headings carry a disclosure", async ({ page }) => {
    await openUnlocked(page);
    await expect(page.getByTestId("disclose-calendar-list")).toBeVisible();
    await gotoTab(page, "tasks");
    await expect(page.getByTestId("gantt-mini-label")).toBeVisible();
    await expect(page.getByTestId("disclose-gantt-mini")).toBeVisible();
    const before = (await page.getByTestId("gantt-mini-label").boundingBox())!;
    await page.getByTestId("disclose-waiting-on").click();
    await expect(page.getByTestId("gantt-mini-label")).toBeVisible();
    await expect(page.getByTestId("gantt-mini-from")).toBeVisible();
    const after = (await page.getByTestId("gantt-mini-label").boundingBox())!;
    expect(after.y).toBeLessThan(before.y);
    await page.getByTestId("disclose-waiting-on").click();
  });
});

const TABS: Tab[] = ["today", "tasks", "brain", "life", "agents"];

/**
 * CL-04 — the delta review: two sections collapsed on each tab must not
 * break the layout around them. RL-11 (`e2e/matrix/theme.spec.ts`) runs the
 * same two sweeps but always on the fully-expanded page; this is the state
 * the review actually leaves the app in, and CL-01..CL-03's own specs never
 * assert on the OTHER sections while one is folded.
 *
 * `e2e/core/**` runs only on w393-light and w1366-light (`playwright.config.ts`),
 * which is exactly CL-04's "at 393 and 1366" — no manual viewport needed.
 */
test.describe("CL-04 the delta review passes with two sections collapsed", () => {
  test("on every tab, nothing overlaps and nothing scrolls sideways with two sections folded", async ({ page }) => {
    await openUnlocked(page);
    const all: string[] = [];
    for (const tab of TABS) {
      if (tab !== "today") await gotoTab(page, tab);
      const screen = `[data-testid="tab-screen-${tab}"]`;
      const discloses = page.locator(`${screen} [data-testid^="disclose-"]`);
      const n = await discloses.count();
      expect(n, `${tab} has fewer than two collapsible sections`).toBeGreaterThanOrEqual(2);
      await discloses.nth(0).click();
      await discloses.nth(1).click();
      all.push(...(await horizontalScrollViolations(page)).map((v) => `[${tab}] ${v.detail}`));
      all.push(...(await overlapViolations(page, screen)).map((v) => `[${tab}] ${v.detail}`));
    }
    expect(all).toEqual([]);
  });
});
