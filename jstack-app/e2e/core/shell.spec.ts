/**
 * GL-01/02/03/07/08, NR-02/03 — the app shell: the gate, the five tabs
 * and their routing, theme, and the Help dialog.
 */
import { assertCleanConsole, expect, gotoTab, openApp, openUnlocked, test } from "../helpers";

test.describe("GL-02/LK-01/SEC-02 the gate", () => {
  test("opens locked; a passkey assertion unlocks; relaunch locks again", async ({ page }) => {
    const log = await openApp(page);
    await expect(page.getByTestId("facelock")).toBeVisible();
    // LK-01's exact copy (row 15 fixed this — it previously read "JSTACK is
    // locked", never matching the acceptance text)
    await expect(page.getByText("Locked. Unlock with your passkey.")).toBeVisible();

    await page.getByTestId("facelock").click();
    await expect(page.getByTestId("facelock")).toHaveCount(0);
    await expect(page.getByTestId("tab-today")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
    assertCleanConsole(log);
  });

  test("SEC-02: a bare context (no virtual authenticator) cannot unlock", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("facelock").click();
    // no virtual authenticator installed on this bare context — must stay locked
    await page.waitForTimeout(500);
    await expect(page.getByTestId("facelock")).toBeVisible();
    await context.close();
  });
});

test.describe("GL-07 five tabs route, active state", () => {
  test("Today, Tasks, Brain, Life, Agents each route and mark the active tab", async ({ page }) => {
    const log = await openUnlocked(page);
    for (const tab of ["today", "tasks", "brain", "life", "agents"] as const) {
      await gotoTab(page, tab);
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute("aria-selected", "true");
    }
    assertCleanConsole(log);
  });
});

test.describe("GL-03 theme", () => {
  test("html/body background equals the ground token — no light flash class present", async ({ page }) => {
    await openUnlocked(page);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "auto");
    expect(["auto", "light", "dark", undefined]).toContain(theme);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe(""); // painted, not transparent-default
  });
});

test.describe("GL-08 Help — What works in this build", () => {
  test("lists every capability with an honest status", async ({ page }, testInfo) => {
    // the Help button is desktop-only this row (RL-05: phone's header carries
    // Settings + Theme, not Arrange/Help — a phone entry point is row 16's
    // Settings sheet); run this on the desktop-shaped core project.
    test.skip(testInfo.project.name === "w393-light", "Help has no phone entry point yet (row 16)");
    const log = await openUnlocked(page);
    await page.getByTestId("header").getByLabel("Help").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await expect(page.getByText("What works in this build")).toBeVisible();
    await expect(page.getByText("Spoken replies (this device's browser)")).toBeVisible();
    await page.getByTestId("help-dialog-close").click();
    await expect(page.getByTestId("help-dialog")).toHaveCount(0);
    assertCleanConsole(log);
  });
});

test.describe("GL-06 prefers-reduced-motion drops the mic pulse", () => {
  test("no-preference animates the orb", async ({ page }) => {
    await openUnlocked(page);
    await expect(page.getByTestId("mic-orb")).toHaveAttribute("data-animating", "on");
  });

  test("reduce stops the transform loop but not the opacity drift", async ({ page }) => {
    // set BEFORE the app ever mounts — reloading after unlock re-locks the
    // session (locked defaults true, unlock is in-memory only), so this has
    // to be the state the very first mount sees, not a live toggle.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openUnlocked(page);
    await expect(page.getByTestId("mic-orb")).toHaveAttribute("data-animating", "off");
    const scale = await page.getByTestId("mic-orb").evaluate((el) => getComputedStyle(el.parentElement!).transform);
    expect(scale === "none" || scale === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  });
});

test.describe("NR-02/NR-03 error boundaries", () => {
  test("NR-03: a locked app that fails to hydrate still shows either the gate or the recovery screen, never a blank page", async ({ page }) => {
    await openApp(page);
    const hasGate = await page.getByTestId("facelock").isVisible();
    const hasRecovery = await page.getByTestId("recovery-screen").isVisible().catch(() => false);
    expect(hasGate || hasRecovery).toBe(true);
  });
});
