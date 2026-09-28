/**
 * e2e helpers — console collection (GL-00: budget zero), unlock, tab
 * navigation, store-state reads via the window.__JSTACK__ hook (assert on
 * state, never logs). Row 5 v2: tabs are the five V2 ones (no Habits,
 * ADR-06); `store`/`db`/`calls` read the seven new stores and
 * data/mock/db.ts; `undo`/`expectUndoToast` exercise stores/session.ts's
 * undo ledger (UN-01); `pickProject` reads a `wNNN-scheme` Playwright
 * project name for the matrix specs (row 6+).
 */
import { Page, expect, test as base } from "@playwright/test";

type ConsoleLog = { issues: string[] };

/** BS-05 swap runs: the CONTRACT designs these statuses (423 locked rules,
 * 403 t1, 422 pinned-hide, 409 late undo) — the browser's own resource-load
 * line for them is expected operation, not an app defect. App-code console
 * output still fails. Mock runs have no network, so nothing is excused. */
const SWAP_CONTRACT_4XX = /^Failed to load resource: the server responded with a status of (403|409|422|423)/;

/**
 * Pages that take the network away on purpose (PW-02, CD-11).
 *
 * A page declares its own offline window; there is no global switch and no
 * environment flag, so the allowance cannot spread to a test that did not ask
 * for it. Everything except the loss itself is still counted.
 */
const offlineByDesign = new WeakSet<Page>();

/** the browser's own words for "the socket is gone" */
const NETWORK_LOSS = /net::ERR_(FAILED|INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_REFUSED|NAME_NOT_RESOLVED)/;

/** Declare that this page is about to lose the network, and that the browser's
 * complaints about it are expected. Call it before `context.setOffline(true)`. */
export function expectOffline(page: Page): void {
  offlineByDesign.add(page);
}

/**
 * Attach the console/pageerror collectors to a page, ONCE.
 *
 * Idempotent on purpose (AUDIT_v2.md A-01): the `consoleGuard` fixture below
 * attaches for every test, and `openApp` also calls this and hands the log back
 * to specs that assert on it themselves — without the memo those specs would
 * attach a second pair of listeners and count every message twice.
 */
function collectConsole(page: Page): ConsoleLog {
  const marked = page as Page & { __consoleLog?: ConsoleLog };
  if (marked.__consoleLog != null) return marked.__consoleLog;
  const log: ConsoleLog = { issues: [] };
  marked.__consoleLog = log;
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      if (process.env.JSTACK_SWAP === "1" && SWAP_CONTRACT_4XX.test(msg.text())) return;
      // PW-02 pulls the socket on purpose; the browser reports every asset it
      // can no longer fetch. Those are the CONDITION of that test, not a
      // defect in it. Allowed only on a page that declared the window, only
      // for network-loss messages, so nothing else gets a free pass — the
      // guard's whole value is that GL-00's budget is zero (GL-A).
      if (offlineByDesign.has(page) && NETWORK_LOSS.test(msg.text())) return;
      log.issues.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => log.issues.push(`pageerror: ${err.message}`));
  return log;
}

/** true when this run targets the reference backend (BS-05) */
const SWAP_MODE = process.env.JSTACK_SWAP === "1";

export function assertCleanConsole(log: ConsoleLog): void {
  expect(log.issues, "GL-00: console error/warning budget is zero").toEqual([]);
}

/**
 * SEC-02: the web gate runs a REAL passkey ceremony, so every test carries a
 * CDP virtual authenticator (platform, user-verifying). A tap without an
 * authenticator does NOT unlock — sec.spec proves that with a bare context.
 */
export async function installVirtualAuthenticator(page: Page): Promise<void> {
  const marked = page as Page & { __vauth?: boolean };
  if (marked.__vauth) return;
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable" as never);
  await (client as { send: (m: string, p?: object) => Promise<unknown> }).send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  marked.__vauth = true;
}

/** open the app fresh (locked), with a clean mock db */
export async function openApp(page: Page): Promise<ConsoleLog> {
  const log = collectConsole(page);
  await installVirtualAuthenticator(page);
  // BS-05 swap runs (JSTACK_SWAP=1): the db lives in the reference server, so
  // "fresh" means resetting IT between tests — mock runs get this from the
  // per-page adapter + localStorage.clear() below.
  if (process.env.JSTACK_SWAP === "1") {
    const res = await fetch(`${process.env.JSTACK_SWAP_API ?? "http://localhost:8787"}/__test__/reset`, { method: "POST" });
    if (!res.ok) throw new Error(`swap-mode server reset failed (${res.status}): ${await res.text()} — a silent failure here poisons every later test`);
  }
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
  return log;
}

export async function unlock(page: Page): Promise<void> {
  await page.getByTestId("facelock").click();
  await expect(page.getByTestId("facelock")).toHaveCount(0);
  await waitForToastGone(page);
}

export async function openUnlocked(page: Page): Promise<ConsoleLog> {
  const log = await openApp(page);
  await unlock(page);
  await expect(page.getByTestId("tab-today")).toBeVisible({ timeout: 15000 });
  return log;
}

export type Tab = "today" | "tasks" | "brain" | "life" | "agents";

export async function gotoTab(page: Page, tab: Tab): Promise<void> {
  await page.getByTestId(`tab-${tab}`).click();
  await page.waitForTimeout(150);
}

/**
 * Open Settings from wherever this width puts it: the rail on desktop, the
 * header icon on a phone — mutually exclusive by viewport (`Header.tsx` only
 * shows its Settings icon on phone, `Rail.tsx` only renders on desktop).
 *
 * Here rather than in one spec because `lock.spec.ts` needed it too and the
 * copy it would otherwise have made is the copy that drifts (rule 16).
 */
export async function clickSettingsEntry(page: Page): Promise<void> {
  const rail = page.getByTestId("rail-settings");
  if (await rail.count()) {
    await rail.click();
  } else {
    await page.getByTestId("header").getByLabel("Settings").click();
  }
}

export async function waitForToastGone(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), undefined, { timeout: 5000 }).catch(() => {});
}

/**
 * B-246's settle window (A4R11-01): a control that has just taken the place of
 * the one pressed does not answer a press until it has held it for 800 ms —
 * the app's answer to a double-click answering the next row. A spec that
 * presses two different controls at the same point, as fast as Playwright can,
 * is doing what a person cannot; this is the pause a person takes to read what
 * they are about to press. Only the cadence: nothing about the assertions.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(850);
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByTestId("toast")).toContainText(text, { timeout: 4000 });
}

/** UN-01: assert the toast is showing WITH the undo control (not a plain
 * toast) — optionally also checking its message. */
export async function expectUndoToast(page: Page, text?: string | RegExp): Promise<void> {
  if (text != null) await expect(page.getByTestId("toast")).toContainText(text, { timeout: 4000 });
  await expect(page.getByTestId("toast-undo")).toBeVisible({ timeout: 4000 });
}

/** UN-01: tap Undo within the 10s window. */
export async function undo(page: Page): Promise<void> {
  await page.getByTestId("toast-undo").click();
  await waitForToastGone(page);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is untyped by design (test-only, stripped from prod) */
export async function store(page: Page, name: string): Promise<any> {
  return page.evaluate((n) => (window as any).__JSTACK__.stores[n](), name);
}

export async function db(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__JSTACK__.db());
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** UX-02: raise or drop a simulated soft keyboard (see lib/testHook.ts). */
export async function setKeyboardInset(page: Page, px: number): Promise<void> {
  await page.evaluate((n) => (window as unknown as { __JSTACK__: { setKeyboardInset: (p: number) => void } }).__JSTACK__.setKeyboardInset(n), px);
}

export async function calls(page: Page): Promise<{ method: string; args: unknown[] }[]> {
  return page.evaluate(() => (window as unknown as { __JSTACK__: { calls: () => { method: string; args: unknown[] }[] } }).__JSTACK__.calls());
}

/** matrix helpers — parse a `wNNN-scheme` Playwright project name */
type Density = "phone" | "rail2" | "rail3";

export function pickProject(projectName: string): { width: number; scheme: "light" | "dark" } {
  const m = projectName.match(/^w(\d+)-(light|dark)$/);
  if (!m) throw new Error(`not a matrix project: ${projectName}`);
  return { width: Number(m[1]), scheme: m[2] as "light" | "dark" };
}

/** theme/useLayout.ts's own breakpoint table (768/1180), for a matrix spec
 * asserting column count / rail presence against a project's width. */
function densityOf(width: number): Density {
  return width < 768 ? "phone" : width < 1180 ? "rail2" : "rail3";
}

/**
 * GL-00 / GL-01 — the console budget, asserted on EVERY test.
 *
 * `02_ACCEPTANCE_TESTS_v2.md` §3 says "Every Playwright test installs the
 * virtual authenticator, collects the console and asserts the budget is zero at
 * the end", and GL-01 says the count is zero "across every Playwright test".
 * It was not: this file re-exported Playwright's plain `test`, so the log was
 * COLLECTED everywhere (inside `openApp`) and ASSERTED only where a spec
 * happened to call `assertCleanConsole` — 31 of 151 tests. The auditor proved
 * it by planting a `console.error` in Agents' render: all ten `agents.spec.ts`
 * tests passed while the same plant failed `shell.spec.ts` (A-01). SEC-14's
 * PASS rested on the same reasoning and fell with it.
 *
 * An `auto` fixture makes the assertion structural instead of remembered. The
 * 31 explicit calls still stand and still pass — asserting an empty list twice
 * costs nothing, and they document the intent at the point it matters.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const log = collectConsole(page);
      await use();
      assertCleanConsole(log);
    },
    { auto: true },
  ],
});

export { expect };
