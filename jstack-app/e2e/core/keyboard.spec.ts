/**
 * v2.3.2 WPR-4 — the keyboard shares the screen, in Safari's engine at a phone's width.
 *
 * Josh, 16 Sep: "When I click enter, the screen stays zoomed in, cropping the view." The zoom is iOS answering a
 * field under 16 px; the crop is the page left scrolled after the keyboard goes. WebKit here has no soft keyboard,
 * so this proves what a browser can — the Find field's computed size, and the page's scroll back at the top after
 * Enter — and DEVICE_RUNBOOK.md asks the phone for the rest. It drives the served test export in Playwright's WebKit
 * (installed on this machine; skipped, saying so, where it is not) with WebAuthn removed, so the gate offers the
 * mock's own sign-in (WPN-1). Once, at 393: the core project's two widths would run the same phone twice.
 */
import { webkit } from "@playwright/test";
import { expect, test } from "../helpers";

test.describe("WPR-4 the keyboard shares the screen", () => {
  test("WebKit at 393: Find is 16 px or larger, and after Enter the page is scrolled back to the top", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "w393-light", "a phone case: it runs once, at 393");
    const browser = await webkit.launch().catch(() => null);
    test.skip(browser == null, "Playwright's WebKit is not installed on this machine — the phone check in DEVICE_RUNBOOK.md is the proof");
    try {
      const context = await browser!.newContext({ baseURL: "http://localhost:4173", viewport: { width: 393, height: 830 }, hasTouch: true, timezoneId: "Australia/Brisbane" });
      const page = await context.newPage();
      await page.addInitScript(() => {
        delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
        Object.defineProperty(navigator, "credentials", { configurable: true, get: () => undefined });
      });
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.getByTestId("mock-sign-in").click({ timeout: 20_000 });
      await expect(page.getByTestId("facelock")).toHaveCount(0);
      await page.getByTestId("tab-brain").click();

      const find = page.getByTestId("find-input");
      await find.scrollIntoViewIfNeeded();
      await find.click();
      const size = await find.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
      await find.fill("Andy");
      await find.press("Enter");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      await browser!.close();
    }
  });
});
