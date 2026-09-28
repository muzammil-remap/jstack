/**
 * v2.3.1 WPN-1 / WPN-2 — the packaged mock opens from a file with no authenticator.
 *
 * Josh, 15 Sep: "I can't open the mock 14 or mock 15 in html. Saying 'this browser has no authenticator'. I have
 * flagged this before and sick of having to re-solve the same errors. As part of v2.3 final deliverables make sure the
 * mock html can be opened on chrome, brave and safari browsers. It's a mock."
 *
 * Opened from Dropbox, the mock is a file page, and no passkey ceremony can run there. These cases open the committed
 * `jstack-mock-v15.html` — the file QA-06 proves was built from this source — by its file URL, with no virtual
 * authenticator, and go through the Enter screen to Today. They do not use `helpers.ts`'s `openApp`: that installs the
 * CDP authenticator this case exists to be without, and it serves the test export rather than the file. They do run
 * under its console guard (`test` comes from the helpers, CD-12), so the file's own console must stay clean too; the
 * WebKit case drives a browser of its own, which that guard does not watch.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { webkit, type Page } from "@playwright/test";
import { expect, test } from "../helpers";

const MOCK_FILE = pathToFileURL(join(__dirname, "..", "..", "..", "jstack-mock-v15.html")).href;

/** what a browser with no WebAuthn gives a page: no PublicKeyCredential, no credentials API */
function removeWebAuthn(): void {
  delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  Object.defineProperty(navigator, "credentials", { configurable: true, get: () => undefined });
}

async function throughTheEnterScreen(page: Page, { tapFirst }: { tapFirst: boolean }): Promise<void> {
  await page.goto(MOCK_FILE);
  await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 30_000 });
  // a tap first is what a person does on a page that still has PublicKeyCredential: the ceremony runs and is refused
  if (tapFirst) await page.getByTestId("facelock").click();
  await expect(page.getByTestId("mock-sign-in")).toBeVisible();
  await expect(page.getByTestId("mock-sign-in-note")).toBeVisible();
  await page.getByTestId("mock-sign-in").click();
  await expect(page.getByTestId("facelock")).toHaveCount(0);
  await expect(page.getByTestId("tab-today")).toBeVisible();
  // the fixture data, not an empty shell
  await expect(page.getByText(/then proposes 1/).first()).toBeVisible();
}

test.describe("WPN-2 the packaged mock opens from a file with no authenticator", () => {
  test("chromium, WebAuthn removed: the Enter screen signs in without a passkey, and Today shows the fixture data", async ({ page }) => {
    await page.addInitScript(removeWebAuthn);
    await throughTheEnterScreen(page, { tapFirst: false });
  });

  test("chromium as a file page has it: the passkey ceremony the page refuses leads to the same sign-in", async ({ page }) => {
    await throughTheEnterScreen(page, { tapFirst: true });
  });

  test("webkit (Safari's engine), WebAuthn removed: the same sign-in reaches Today", async ({ viewport }) => {
    const browser = await webkit.launch().catch(() => null);
    test.skip(browser == null, "Playwright's webkit is not installed on this machine — Josh's Safari check is the proof");
    try {
      const context = await browser!.newContext({ viewport: viewport ?? undefined, timezoneId: "Australia/Brisbane" });
      const page = await context.newPage();
      await page.addInitScript(removeWebAuthn);
      await throughTheEnterScreen(page, { tapFirst: false });
    } finally {
      await browser!.close();
    }
  });
});
