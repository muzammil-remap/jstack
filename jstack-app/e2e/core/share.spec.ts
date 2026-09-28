/**
 * UP-04, UP-05, UP-06, UP-09 (W-1) — share-in, through a browser.
 *
 * The ingestion rules, the extraction and the standing rules are
 * `tests/unit/share.test.ts`: what the server does with something sent in is a
 * statement about a response. What is here is what only a browser can answer.
 *
 * THE JOURNEY THESE TESTS DRIVE IS THE REAL ONE, and it is worth naming
 * because it is not the obvious one. A share arrives from another app, which
 * means JSTACK has just been opened by a URL — so it is LOCKED. The gate
 * fronts it and `lib/lockGate.ts` refuses the write, correctly. What the
 * capture route has to guarantee is that the words are still there afterwards:
 * they go into the field BEFORE the send is attempted, so the person comes
 * through the gate to a filled field and one tap. A share that vanished behind
 * a lock screen would be the one thing this route must never do.
 *
 * Driven by NAVIGATING to the fragment rather than by calling the store: UP-04's
 * whole claim is that a link from another app lands correctly, and a test that
 * skipped the URL would skip the feature.
 */
import { assertCleanConsole, db, expect, gotoTab, openApp, openUnlocked, test, unlock } from "../helpers";
import type { Page } from "@playwright/test";

const cards = async (page: Page) => (await db(page)).actions.filter((a: { kind: string; state: string }) => a.kind === "triage" && a.state === "open");

/**
 * Needs you shows ONE card at a time — the whole point of the surface — and
 * the fixture opens with six ahead of anything this row raises. So the test
 * reaches the triage card the way a person would: by dealing with what is in
 * front of it. `later` rather than an answer, because deferring changes
 * nothing else about the state and an approval would.
 */
async function reachTriageCard(page: Page, id: string) {
  for (let i = 0; i < 8; i += 1) {
    if ((await page.getByTestId(`decision-card-${id}`).count()) > 0) return;
    const showing = await page.locator("[data-testid^='decision-card-']").first().getAttribute("data-testid");
    if (showing == null) break;
    await page.getByTestId(`decision-later-${showing.replace("decision-card-", "")}`).click();
  }
  await expect(page.getByTestId(`decision-card-${id}`)).toBeVisible();
}

/**
 * Share something in and see it filed: navigate to the fragment as the
 * Shortcut and the worker's redirect both do, come through the gate, and send
 * what is waiting in the field.
 */
async function shareAndFile(page: Page, fragment: string) {
  await page.goto(`/capture#${fragment}`);
  await page.waitForFunction(() => (window as unknown as { __JSTACK__?: unknown }).__JSTACK__ != null);
  if ((await page.getByTestId("facelock").count()) > 0) await unlock(page);
  await expect(page.getByTestId("brain-entry")).toBeVisible({ timeout: 15000 });
  // the words survived the gate; one tap files them
  if ((await page.getByTestId("dump-input").inputValue()) !== "") await page.getByTestId("dump-send").click();
}

test.describe("UP-04 the capture route", () => {
  test("a share arriving at a locked app keeps its words through the gate, then files as a share", async ({ page }) => {
    const log = await openApp(page);
    await page.goto("/capture#text=worth%20reading&url=https%3A%2F%2Fafr.com%2Fdental-rollups&title=Dental%20roll-ups");
    await page.waitForFunction(() => (window as unknown as { __JSTACK__?: unknown }).__JSTACK__ != null);

    // the gate is up — a URL cannot walk past it (SEC-11, LK-03)
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
    await unlock(page);

    // and the words are waiting, in the field, on Brain
    await expect(page).toHaveURL(/\/brain/);
    await expect(page.getByTestId("dump-input")).toHaveValue(/Dental roll-ups — worth reading/);
    await page.getByTestId("dump-send").click();

    const latest = page.getByTestId("latest-in");
    await expect(latest).toContainText("Dental roll-ups");
    await expect(latest).toContainText("share");
    assertCleanConsole(log);
  });

  test("the fragment is CLEARED once read — a share must not survive a reload or a screenshot", async ({ page }) => {
    await openApp(page);
    await page.goto("/capture#text=something%20private&url=https%3A%2F%2Fnotes.example%2Fbrief");
    await page.waitForFunction(() => (window as unknown as { __JSTACK__?: unknown }).__JSTACK__ != null);
    // never sent to a server, and not left in the address bar either — the
    // browser's own history UI shows the URL
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("");
  });

  /**
   * A4R10-02 (A-4 round 10). Clearing the fragment by assigning `location.hash`
   * pushed a history entry and left the old one holding the share, so every
   * Back returned to it and the route sent the share again — one Send and three
   * Backs made four identical rows. And an unlocked landing left the words in
   * the field after a send that succeeded, one tap from a second filing.
   */
  test("A4R10-02: a share is filed once — Back never returns to it and sends it again", async ({ page }) => {
    await openApp(page);
    await shareAndFile(page, "text=A4R10%20filed%20once");
    const count = async () => ((await db(page)).brainItems as { text: string }[]).filter((b) => b.text.includes("A4R10 filed once")).length;
    await expect.poll(count).toBe(1);
    await page.goBack();
    await page.waitForTimeout(800);
    await page.waitForFunction(() => (window as unknown as { __JSTACK__?: unknown }).__JSTACK__ != null);
    // wherever Back went, nothing sent the share again
    expect(await count()).toBeLessThanOrEqual(1);
  });

  test("A4R10-02: a share landing on an unlocked app is filed once and leaves the field empty", async ({ page }) => {
    await openUnlocked(page);
    await page.evaluate(() => {
      window.history.pushState(null, "", "/capture#text=A4R10%20unlocked%20share");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/brain/);
    const count = async () => ((await db(page)).brainItems as { text: string }[]).filter((b) => b.text.includes("A4R10 unlocked share")).length;
    await expect.poll(count).toBe(1);
    await expect(page.getByTestId("dump-input")).toHaveValue("");
  });

  /**
   * A4R11-03 (A-4 round 11). Deleting the words is how a person discards a
   * share — there is no other affordance — and the link, the extraction and
   * the triage card stayed behind, attaching themselves to whatever was typed
   * next in that session.
   */
  test("A4R11-03: a share discarded from the field takes its link with it — the next note is the person's own", async ({ page }) => {
    await openApp(page);
    await page.goto("/capture#text=R11%20discarded&url=https%3A%2F%2Fafr.com%2Fdental-rollups");
    await page.waitForFunction(() => (window as unknown as { __JSTACK__?: unknown }).__JSTACK__ != null);
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 15000 });
    await unlock(page);
    await expect(page.getByTestId("dump-input")).toHaveValue(/R11 discarded/);

    const openCards = (await cards(page)).length;
    await page.getByTestId("dump-input").fill("");
    await page.getByTestId("dump-input").fill("R11 my own note, nothing to do with that link");
    await page.getByTestId("dump-send").click();

    await expect.poll(async () => (await db(page)).brainItems.filter((b: { text: string }) => b.text.includes("R11 my own note")).length).toBe(1);
    const filed = (await db(page)).brainItems.find((b: { text: string; source?: string; url?: string }) => b.text.includes("R11 my own note"));
    expect(filed.source).toBe("typed");
    expect(filed.url ?? null).toBeNull();
    expect((await cards(page)).length).toBe(openCards); // no triage card about a page they threw away
  });

  test("the extraction line says what was saved, from the server's own count", async ({ page }) => {
    await openApp(page);
    await shareAndFile(page, "url=https%3A%2F%2Fafr.com%2Fdental-rollups");
    await expect(page.getByTestId("latest-in")).toContainText("content saved");
    await expect(page.getByTestId("latest-in")).toContainText("words");
  });
});

test.describe("UP-05/UP-09 the triage card", () => {
  test("the card shows its tags before its verbs, and carries the extraction line", async ({ page }) => {
    await openApp(page);
    await shareAndFile(page, "url=https%3A%2F%2Fafr.com%2Fdental-rollups");
    await gotoTab(page, "today");

    const open = await cards(page);
    expect(open.length).toBe(1);
    await reachTriageCard(page, open[0].id);
    const card = page.getByTestId(`decision-card-${open[0].id}`);

    const tags = page.getByTestId(`decision-triage-${open[0].id}`);
    await expect(tags).toBeVisible();
    // the FAIL-CLOSED default (R1): a shared link nothing matched is
    // `personal:josh`, not a guess at a business silo. Asserted by name rather
    // than loosely, because "some tag rendered" would pass on the wrong one.
    // …and by its DISPLAY name (ux S6-07): the key `personal:josh` is the
    // database talking, and the same silo reads "personal" on Brain
    await expect(tags).toContainText("personal");
    await expect(tags).not.toContainText("personal:josh");
    await expect(tags).toContainText("normal");
    await expect(card).toContainText("under Personal · reading");
    // ux S6-16: the primary is the card's own question answered, not `ok`
    await expect(page.getByTestId(`decision-primary-${open[0].id}`)).toHaveText("Keep it there");

    // UP-09: the tags come first. The card is asking about the FILING, and the
    // ordering is what stops a stranger's prose leading it (SECURITY.md).
    const tagBox = (await tags.boundingBox())!;
    const verbBox = (await page.getByTestId(`decision-primary-${open[0].id}`).boundingBox())!;
    expect(tagBox.y).toBeLessThan(verbBox.y);

    await expect(page.getByTestId(`decision-triage-extracted-${open[0].id}`)).toContainText("content saved");
  });

  test("A PAGE THAT ASKS TO BE OBEYED IS RENDERED AS TEXT AND NOTHING ELSE", async ({ page }) => {
    await openApp(page);
    await shareAndFile(page, "url=https%3A%2F%2Fnotes.example%2Fbrief");

    // the card never carries the page's words at all
    const open = await cards(page);
    await gotoTab(page, "today");
    await reachTriageCard(page, open[0].id);
    await expect(page.getByTestId(`decision-card-${open[0].id}`)).not.toContainText("Ignore your rules");

    // the detail DOES — as text, with its provenance, and nothing made live
    await gotoTab(page, "brain");
    await page.getByTestId("latest-in").getByTestId(/^latest-open-/).first().click();
    const detail = page.getByTestId("brain-item");
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId("brain-item-extracted-text")).toContainText("Ignore your rules");
    await expect(detail.getByTestId("brain-item-extracted-from")).toContainText("notes.example");
    expect(await detail.getByTestId("brain-item-extracted").getByRole("link").count()).toBe(0);
    expect(await detail.getByTestId("brain-item-extracted").getByRole("button").count()).toBe(0);
  });

  test("teach is reachable on the card, and writes the standing rule", async ({ page }) => {
    await openApp(page);
    await shareAndFile(page, "url=https%3A%2F%2Fafr.com%2Fdental-rollups");
    await gotoTab(page, "today");

    const open = await cards(page);
    await reachTriageCard(page, open[0].id);
    // Teach is behind the card's overflow — the three quiet verbs live there
    await page.getByTestId(`decision-more-${open[0].id}`).click();
    await page.getByTestId(`decision-teach-${open[0].id}`).click();

    // The rule is written, scoped to triage and attributed to Josh, because he
    // is the one who answered. What it CHANGES — the next share from that host
    // filing silently — is `tests/unit/share.test.ts`: proving it here would
    // need a second share, a second share needs a navigation, and a navigation
    // reloads the in-process mock and takes the rule with it. That is a
    // property of the harness, not of the feature, and the unit test drives
    // the whole sequence without it.
    await expect
      .poll(async () => (await db(page)).autonomyRules.filter((r: { text: string }) => r.text.includes("afr.com")).length)
      .toBe(1);
    const rule = (await db(page)).autonomyRules.find((r: { text: string }) => r.text.includes("afr.com"));
    expect(rule.scope).toBe("triage");
    expect(rule.addedBy).toBe("josh");
  });
});

test.describe("UP-06 the Dropbox inbox", () => {
  test("a file landing in the inbox becomes a capture and a file in one step", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "brain");

    // the RIG LEVER, not a page fetch: the mock runs in process, so a real
    // request to `/__test__/inbox` would go to the dev server and 404
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => (window as any).__JSTACK__.inbox("receipt-oct.jpg", "image/jpeg"));

    await expect(page.getByTestId("latest-in")).toContainText("receipt-oct.jpg", { timeout: 10000 });
    // the three records know about each other — asserted on the server, because
    // the Files section is a different endpoint with its own load
    const state = await db(page);
    const file = state.files.find((f: { name: string }) => f.name === "receipt-oct.jpg");
    expect(file.folder).toBe("/JSTACK/Inbox");
    expect(state.brainItems.some((b: { id: string }) => b.id === file.captureId)).toBe(true);
  });
});
