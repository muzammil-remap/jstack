/**
 * SH-06, SH-08, SH-09, SH-10 (H-1) — the hardening pass, in a browser.
 *
 * `tests/unit/hardening.test.ts` proves the rules at the seams: the lock
 * gate, the text-only rendering, the schema validators. This file proves them
 * where a person would meet them: markup a model wrote arrives on a real
 * screen and stays text; the served page carries its policy; a server that
 * signs this device out gets the app locked with the right sentence; a body
 * the contract does not allow comes back as a 422 that names the field.
 *
 * SH-07 (supply chain) is CI's and Jest's — a frozen lockfile, the secret scan
 * over the prod bundle, `.npmrc` — and has no browser half. SH-06's last
 * clause, "an unknown verb is dropped at render", is `tests/native/
 * sections.test.tsx`: a row with an unknown verb cannot be injected from the
 * rig, because the validator refuses it at the door.
 *
 * Written at Stage 4 A-0 (Josh's row 1): H-1 never wrote this file, and SH-06
 * sat PARTIAL for a stage on that account.
 */
import { calls, expect, gotoTab, openUnlocked, store, test } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__ is test-only, untyped by design */
const rig = (page: import("@playwright/test").Page) => ({
  proposeSection: (config: unknown, reason: string) => page.evaluate(([c, r]) => (window as any).__JSTACK__.proposeSection(c, r), [config, reason] as const),
  revokeThisDevice: () => page.evaluate(() => (window as any).__JSTACK__.revokeThisDevice()),
  /** a call through the live adapter; resolves to "ok" or to the error's status + field */
  adapterCall: (method: string, args: unknown[]) =>
    page.evaluate(
      async ([m, a]) => {
        try {
          await (window as any).__JSTACK__.getAdapter()[m](...(a as unknown[]));
          return { outcome: "ok" };
        } catch (e) {
          const err = e as { status?: number; field?: string; reason?: string };
          return { outcome: "error", status: err.status, field: err.field, reason: err.reason };
        }
      },
      [method, args] as const,
    ),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A section the EA might propose with markup in every string it owns. The
 * validator lets it through — it is well-formed, under 200 characters, and
 * says nothing about HTML, because the rule is not "no angle brackets", it is
 * "a model's string is printed, never interpreted".
 */
const MARKUP = {
  id: "hardening",
  tab: "life",
  title: "Reading <b>list</b>",
  column: 3,
  configure: true,
  source: { endpoint: "/learning" },
  blocks: [
    {
      type: "text",
      idPrefix: "hardening",
      text: '<img src=x onerror="document.title=\'pwned\'"> then <script>document.title="pwned"</script> and <b>bold</b>',
    },
  ],
  version: 1,
  state: "proposed",
  managedBy: "ea",
  changedAt: "2026-09-01T09:00:00.000Z",
};
const CARD = "sec-hardening-1";

test.describe("SH-06 EA-authored markup is printed, never interpreted", () => {
  test("a proposed section's title and text land on screen as characters; nothing in them ran", async ({ page }) => {
    await openUnlocked(page);
    await rig(page).proposeSection(MARKUP, "You read most mornings.");

    // the card's preview first — it renders the SAME blocks
    const row = page.getByTestId(`waiting-open-${CARD}`);
    if (await row.count()) await row.click();
    const card = page.getByTestId(`decision-card-${CARD}`);
    await expect(card).toBeVisible();
    const preview = page.getByTestId("decision-section-hardening");
    await expect(preview).toContainText("<script>");
    expect(await preview.locator("script, img").count()).toBe(0);

    // approve, and the section itself on Life
    await page.getByTestId(`decision-primary-${CARD}`).click();
    await gotoTab(page, "life");
    const section = page.getByTestId("life-hardening-section");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Reading <b>list</b>");
    await expect(section).toContainText('<img src=x onerror="document.title=\'pwned\'">');
    await expect(section).toContainText("<script>");
    // H-1 put an `Icon` in every section heading, and every icon in this app is
    // an SVG (ADR-09) — so "no svg anywhere in this section" became a sentence
    // about the app's own chevron rather than about the EA's string, and would
    // now fail on every section forever. The claim is unchanged: nothing the EA
    // wrote became an element. `script`, `img` and `iframe` are never rendered
    // inside a section by anything, so zero still means zero; the svgs that ARE
    // here must all be the disclosure's, and the count says so rather than
    // waving the check away (A-18).
    expect(await section.locator("script, img, iframe").count()).toBe(0);
    const chevron = await section.locator('[data-testid^="disclose-"] svg').count();
    expect(chevron).toBe(1); // it is really there, so the comparison below is not vacuous
    expect(await section.locator("svg").count()).toBe(chevron);
    expect(await page.locator("script[src=''], script:not([src])").filter({ hasText: "pwned" }).count()).toBe(0);
    // the payloads set the document title if they ran; a running session
    // sets it to "● Talking · JSTACK", nothing else touches it
    expect(await page.title()).not.toContain("pwned");
  });

  test("the one tag a model may use — <b> — survives only where RichText renders it, and as weight, not as text", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");
    // memory proposals are the field the EA writes with <b> (B-19): the
    // fixture's p1 reads "Steve's villa deposit is <b>$4,500</b>, not $4,000",
    // so the figure must be on screen and the literal tag must not
    const proposal = page.getByTestId("proposal-p1");
    await expect(proposal).toBeVisible();
    await expect(proposal).toContainText("$4,500");
    const text = await proposal.innerText();
    expect(text).not.toContain("<b>");
    expect(text).not.toContain("</b>");
  });
});

test.describe("SH-01 / SH-08 the served page carries its policy", () => {
  test("the CSP meta is present with the directives the headers file promises, and the console is clean", async ({ page }) => {
    await openUnlocked(page);
    const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    // `frame-ancestors` is a HEADER directive — a <meta> cannot carry it and
    // Chrome logs an error if one tries, which GL-00 would count. It lives in
    // public/_headers (tests/unit/pwa.test.ts), and the meta is derived from
    // that file less exactly this directive (tools/csp.mjs, R-13).
    expect(csp).not.toContain("frame-ancestors");
    // the console budget (GL-00) is asserted on every test by the fixture: a
    // CSP violation on load would already have failed this one
  });
});

test.describe("SH-09 the server signs this device out", () => {
  test("the app locks at once, says which lock this is, and the next request is refused", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "tasks");
    await rig(page).revokeThisDevice();

    await expect(page.getByTestId("facelock")).toBeVisible();
    await expect(page.getByTestId("locked-signed-out")).toContainText("This device was signed out.");
    // not the passkey line — a passkey cannot reopen this
    await expect(page.getByTestId("facelock")).not.toContainText("Unlock with your passkey");
    const session = await store(page, "session");
    expect(session.locked).toBe(true);
    expect(session.signedOut).toBe(true);

    // and the server refuses the next thing the app asks for, because the
    // tokens are gone on both sides
    expect(await rig(page).adapterCall("getToday", [])).toMatchObject({ outcome: "error", status: 401 });
  });
});

test.describe("SH-10 the server validates every body against the contract", () => {
  test("a body the contract does not allow is a 422 that names the field, before any handler sees it", async ({ page }) => {
    await openUnlocked(page);
    const before = (await calls(page)).length;
    const bad = await rig(page).adapterCall("putQuietHours", [{ start: 25, end: "07:00", exceptions: [] }]);
    expect(bad.outcome).toBe("error");
    expect(bad.status).toBe(422);
    expect(typeof bad.field).toBe("string");
    expect(bad.field).toContain("start");
    // the app made the call (it is logged) and nothing changed for it
    expect((await calls(page)).length).toBe(before + 1);
    const good = await rig(page).adapterCall("putQuietHours", [{ start: "22:00", end: "07:00", exceptions: [] }]);
    expect(good.outcome).toBe("ok");
  });
});
