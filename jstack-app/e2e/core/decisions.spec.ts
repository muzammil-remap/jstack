/**
 * DC-01..10, UN-01/02/04, TD-03, FS-02 — decision cards, undo, the From-
 * your-EA insight, and focus narrowing on Today.
 *
 * UN-03 (task done / habit toggle / proposal ok / agent-issue verb each
 * offer undo) spans Tasks/Life/Agents, none of which ship real content
 * until later rows (9/13+) — it is exercised in each of those tabs' own
 * spec as it lands, not here.
 */
import { shortWeekday } from "../../lib/time";
import { assertCleanConsole, calls, db, expect, expectToast, expectUndoToast, gotoTab, openUnlocked, pickProject, settle, test, undo, waitForToastGone } from "../helpers";

test.describe("DC-01 exactly one card open, badge, history link", () => {
  test("c1 opens by default, badge equals open count, history opens the dialog", async ({ page }) => {
    const log = await openUnlocked(page);
    await expect(page.getByTestId("decision-card-c1")).toBeVisible();
    await expect(page.getByTestId("waiting-row-c2")).toBeVisible();
    await expect(page.getByTestId("needs-you-label")).toContainText("5"); // rank+cap 5 (OPEN_CARD_CAP)

    await page.getByTestId("needs-you-history").click();
    await expect(page.getByTestId("history-dialog")).toBeVisible();
    await page.getByTestId("history-dialog-close").click();
    await expect(page.getByTestId("history-dialog")).toHaveCount(0);
    assertCleanConsole(log);
  });
});

test.describe("DC-02 Clash card — 1-3-1 options", () => {
  test("tapping an option moves the recommendation; the primary reads 'Go with N'; answering records that option", async ({ page }) => {
    await openUnlocked(page);
    await expect(page.getByTestId("decision-primary-c1")).toHaveText("Go with 1");
    await page.getByTestId("decision-opt-c1-2").click();
    await expect(page.getByTestId("decision-primary-c1")).toHaveText("Go with 2");

    await page.getByTestId("decision-primary-c1").click();
    await expectToast(page, "Went with option 2 · Dev call");
    const c = await calls(page);
    const verbCall = [...c].reverse().find((x) => x.method === "postActionVerb");
    expect(verbCall?.args).toContainEqual(expect.objectContaining({ verb: "approve", option: 2 }));
  });
});

test.describe("DC-03 Email card — quote, approve never sends", () => {
  test("Approve returns outbox_user_sends, toasts, the card leaves and the next opens", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("waiting-open-c2").click();
    await expect(page.getByTestId("decision-card-c2")).toBeVisible();
    await expect(page.getByTestId("decision-quote-c2")).toBeVisible();

    await page.getByTestId("decision-primary-c2").click();
    await expectToast(page, "Approved · Reply to Andy, in Gmail Drafts");
    await expect(page.getByTestId("decision-card-c2")).toHaveCount(0);
    await expect(page.getByTestId("decision-card-c1")).toBeVisible(); // next opens
  });
});

test.describe("DC-04 Bill card — copy links, Open NAB never pays", () => {
  test("only the flagged line gets a copy link; Open NAB answers and toasts; no payment call exists", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("waiting-open-c3").click();
    await expect(page.getByTestId("decision-bill-c3")).toBeVisible();
    // DC-04 says "copy links", plural: the fields you paste into a banking app
    // are the BSB/account and the reference. The PAYEE has none on purpose —
    // "RACQ Insurance" is a name you read, not a string you paste — and that
    // exclusion is recorded in 02_ACCEPTANCE_TESTS_v2.md §4 (A-52) rather than
    // asserted as though the row had always said one link (AUDIT_v2.md B4-03).
    await expect(page.getByTestId("decision-copy-c3-ref")).toBeVisible();
    await expect(page.getByTestId("decision-copy-c3-BSB")).toBeVisible();
    await expect(page.getByTestId("decision-copy-c3-payee")).toHaveCount(0);

    await page.getByTestId("decision-copy-c3-ref").click();
    await expectToast(page, "Copied");
    await waitForToastGone(page);

    await page.getByTestId("decision-primary-c3").click();
    await expectToast(page, "Opened NAB · RACQ bill");
    const c = await calls(page);
    expect(c.some((x) => /pay|send|book|revoke/i.test(x.method))).toBe(false);
  });
});

/**
 * The c1 card's title and then-what, READ from the server rather than written
 * out here. CD-18 makes both derive their weekday from the card's own
 * `expiresAt`, so the literals these assertions used to carry ("Dev call
 * Thursday…", "expires Wed 5pm") were only ever right one day in seven —
 * and were wrong in exactly the same way the fixture was, which is why
 * nothing caught it (A-06).
 */
async function cardCopy(page: import("@playwright/test").Page): Promise<{ title: string; thenWhat: string }> {
  const state = await db(page);
  const c1 = state.actions.find((a: { id: string }) => a.id === "c1");
  return { title: c1.title as string, thenWhat: c1.thenWhat as string };
}

test.describe("DC-05 Revise", () => {
  test("a non-email card answers immediately with the fixed toast", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-revise-c1").click();
    await expectToast(page, `Sent back to revise · ${(await cardCopy(page)).title}`);
    await expect(page.getByTestId("decision-card-c1")).toHaveCount(0);
  });

  test("an email card opens the draft editor and saves a version via PUT /actions/{id}/draft", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("waiting-open-c2").click();
    await page.getByTestId("decision-revise-c2").click();
    await expect(page.getByTestId("revise-dialog")).toBeVisible();
    await expect(page.getByTestId("decision-card-c2")).toBeVisible(); // not answered yet

    await page.getByTestId("revise-text").fill("Mate, next week works — Monday for the contract re-map.");
    await page.getByTestId("revise-save").click();
    await expect(page.getByTestId("revise-dialog")).toHaveCount(0);
    await expectToast(page, "Sent back to revise · Reply to Andy: V2 start date");

    const c = await calls(page);
    expect(c.some((x) => x.method === "putActionDraft")).toBe(true);
  });
});

test.describe("DC-06 Later", () => {
  test("toasts the fixed copy, carries laterUntil, and the card leaves today", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-later-c1").click();
    await expectToast(page, `Later · returns Mon 8am · ${(await cardCopy(page)).title}`);
    await expect(page.getByTestId("decision-card-c1")).toHaveCount(0);

    const state = await db(page);
    const c1 = state.actions.find((a: { id: string }) => a.id === "c1");
    expect(c1.state).toBe("later");
    expect(c1.laterUntil).toBeTruthy();
  });
});

test.describe("DC-07 ··· reveals Never/Teach", () => {
  test("Never toasts, records verb 'never' in history", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-more-c1").click();
    await expect(page.getByTestId("decision-menu-c1")).toBeVisible();

    await page.getByTestId("decision-never-c1").click();
    await expectToast(page, `Never · rule offered · ${(await cardCopy(page)).title}`);

    const state = await db(page);
    const c1 = state.actions.find((a: { id: string }) => a.id === "c1");
    expect(c1.history.at(-1).verb).toBe("never");
  });
});

test.describe("DC-08 / ST-04 Teach", () => {
  test("Save as a rule appends a standing rule, visible under Settings", async ({ page }) => {
    // ST-1 retired `POST /rules` and Brain's parallel list. A rule taught from
    // a card and one written in Settings are the same kind of thing now,
    // appended through the one route the editor saves through — so this
    // asserts where it LANDS rather than which endpoint it took.
    await openUnlocked(page);
    const before = await db(page);
    await page.getByTestId("decision-more-c1").click();
    await page.getByTestId("decision-teach-c1").click();
    await expectToast(page, `Teach · one line to the EA · ${(await cardCopy(page)).title}`);
    await expect(page.getByTestId("teach-sheet")).toBeVisible({ timeout: 2000 });

    await page.getByTestId("teach-text").fill("School pickup days are fixed; move the meeting.");
    await page.getByTestId("teach-save").click();
    await expect(page.getByTestId("teach-sheet")).toHaveCount(0);

    const after = await db(page);
    expect(after.autonomyRules.length).toBe(before.autonomyRules.length + 1);
    const taught = after.autonomyRules.at(-1);
    expect(taught.text).toBe("School pickup days are fixed; move the meeting.");
    // `josh` because he typed it, and the card it came off is in the id
    expect(taught.addedBy).toBe("josh");
    // B-198 / §4: traceable to card c1, and distinct from the id a triage
    // card mints server-side, so the two can never collide
    expect(taught.id.startsWith("ar-c1-taught-")).toBe(true);
  });
});

test.describe("DC-09 card chrome", () => {
  test("type, then-what, why-line and undo 10s render; the record carries a receipt", async ({ page }) => {
    await openUnlocked(page);
    const card = page.getByTestId("decision-card-c1");
    await expect(card).toContainText("Clash");
    // the day comes from the card, not from this file (CD-18, A-06) — and the
    // card shows it in the pack's short form, "expires Thu 5pm", whatever
    // the server composed (ux-review R2-06, `02_ACCEPTANCE_TESTS_v21.md` §4)
    await expect(card).toContainText(shortWeekday((await cardCopy(page)).thenWhat.split(" ·")[0]));
    await expect(card).toContainText("undo 10s");

    const state = await db(page);
    const c1 = state.actions.find((a: { id: string }) => a.id === "c1");
    expect(c1.receipt).toMatchObject({ cost: expect.any(Number), model: expect.any(String), sources: expect.any(Number), seconds: expect.any(Number) });
  });
});

test.describe("DC-10 waiting rows and the end line", () => {
  test("tapping a row's verb answers without opening; tapping its title opens it and closes the current", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("waiting-verb-c4").click(); // answers c4 without ever opening it
    await expect(page.getByTestId("decision-card-c4")).toHaveCount(0);
    await expect(page.getByTestId("decision-card-c1")).toBeVisible(); // still the open one

    await page.getByTestId("waiting-open-c2").click();
    await expect(page.getByTestId("decision-card-c2")).toBeVisible();
    await expect(page.getByTestId("decision-card-c1")).toHaveCount(0);
    await expect(page.getByTestId("needs-you-endline")).toContainText("That's all until 4pm. Two more return then.");
  });

  test("the end line reads 'Nothing needs you' once every open card is answered", async ({ page }) => {
    await openUnlocked(page);
    // always answer whichever card is currently open — the fixture has 6
    // open cards total (rank+cap 5 keeps a 6th waiting off-screen until a
    // capped one leaves), so loop on the button's presence rather than a
    // fixed count of 5.
    const laterBtn = page.locator('[data-testid^="decision-later-"]').first();
    for (let i = 0; i < 10 && (await laterBtn.count()) > 0; i++) {
      await settle(page); // the next card's Later is where the last one's was (B-246)
      const answered = await laterBtn.getAttribute("data-testid");
      await laterBtn.click();
      // D17 (the A-6 re-audit): this waited for the TOAST to leave, and an
      // undo toast does not leave on TOAST_MS — `Toast.tsx`'s timer returns
      // early while `undoLabel` is set, so it lives out its full ten-second
      // ring while `waitForToastGone` sat out its own 5 s timeout and
      // swallowed the rejection. Six cards of that is ~35 s of waiting for
      // something that was never going to happen, in a case whose budget is
      // 45 s: measured at 45.2 s idle, so it failed a board, failed the
      // cold-start stranger's first run, and was filed as a flake twice. It
      // was not random — the runtime was a function of the fixture's open-card
      // count, and one more open card would have failed the board outright.
      //
      // The real post-condition is that the card LEAVES, so that is what this
      // waits for. The toast may still be on screen; it does not cover the
      // next card's button, and `settle()` above is what B-246 needs.
      await expect(page.locator(`[data-testid="${answered}"]`)).toHaveCount(0);
    }
    await expect(page.getByTestId("needs-you-endline")).toContainText("Nothing needs you. Two more return at 4pm.");
  });
});

test.describe("UN-01 undo", () => {
  test("shows the undo toast with a ring and restores + reopens the card", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-primary-c1").click();
    await expectUndoToast(page, "Went with option 1 · Dev call");
    await expect(page.getByTestId("toast-undo")).toContainText("10");

    await undo(page);
    await expect(page.getByTestId("decision-card-c1")).toBeVisible();
  });
});

// R17-01. The undo toast is the app's only take-it-back affordance and nine
// call sites raise it from INSIDE an overlay, so "on top of whatever is open"
// is not a nicety — it is the whole affordance. B8-01's fix moved its host
// inside the app-content wrapper (so one `inert` could switch it off with
// everything else while locked) and thereby moved it into the stacking
// context every Dialog and Sheet lives in, where an unset z-index loses to
// their 100. It went invisible AND unclickable, and on a Dialog the thing
// that answered the click was the scrim, which DISMISSES. No committed frame
// could show it: the device pass photographs the toast over a bare Today.
//
// So this asks the only question that matters — what does a click at the
// toast's own centre actually hit — in both directions, because the two
// requirements pull against each other: above the overlays when unlocked,
// under the gate when locked.
test.describe("R17-01 the undo toast outranks any open overlay, and still loses to the gate", () => {
  test("with a sheet open the toast owns its own pixels; locked, the gate takes them back", async ({ page }) => {
    const log = await openUnlocked(page);
    await page.getByTestId("decision-primary-c1").click();
    await expectUndoToast(page, "Went with option 1 · Dev call");

    // rail on desktop, the header icon on phone — mutually exclusive by
    // viewport, same as settings.spec.ts's own opener
    const rail = page.getByTestId("rail-settings");
    if (await rail.count()) {
      await rail.click();
    } else {
      await page.getByTestId("header").getByLabel("Settings").click();
    }
    await expect(page.getByTestId("settings-sheet")).toBeVisible({ timeout: 10000 });

    const hitAtToastCentre = () =>
      page.evaluate(() => {
        const t = document.querySelector('[data-testid="toast"]') as HTMLElement | null;
        if (t == null) return "no-toast";
        const r = t.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
        if (el == null) return "nothing";
        const owner = el.closest("[data-testid]");
        return owner?.getAttribute("data-testid") ?? el.tagName;
      });
    expect(await hitAtToastCentre()).toMatch(/^toast/);

    // And the other direction: locked, the gate must take the pixels back.
    // The INACTIVITY timer, not a tab hide — L-1 (ADR-41) made hiding a
    // desktop tab a no-op, so the hide this used to lock with stopped locking
    // anything at 1366 and the z-order claim below would have been asserted
    // against an app that was never locked (B-15's shape, second instance).
    await page.evaluate(() => (window as any).__JSTACK__.setAutoLockMs(300));
    await expect(page.getByTestId("facelock")).toBeVisible({ timeout: 8000 });
    expect(await hitAtToastCentre()).toBe("facelock");
    assertCleanConsole(log);
  });
});

test.describe("UN-02 a late undo 409s cleanly", () => {
  test("no console error, no state change", async ({ page }) => {
    const log = await openUnlocked(page);
    await page.getByTestId("decision-primary-c1").click();
    await expectToast(page, "Went with option 1 · Dev call");

    await page.evaluate(() => (window as unknown as { __JSTACK__: { setClockOffsetMs: (ms: number) => void } }).__JSTACK__.setClockOffsetMs(11_000));

    const result = await page.evaluate(async () => {
      const g = window as unknown as { __JSTACK__: { getAdapter: () => { postActionUndo: (id: string) => Promise<unknown> } } };
      try {
        await g.__JSTACK__.getAdapter().postActionUndo("c1");
        return "ok";
      } catch (e) {
        return (e as { status?: number }).status ?? "error";
      }
    });
    expect(result).toBe(409);

    const state = await db(page);
    expect(state.actions.find((a: { id: string }) => a.id === "c1").state).toBe("answered");
    assertCleanConsole(log);
  });
});

test.describe("UN-04 one undo entry at a time", () => {
  test("a second answer replaces the toast and ledger entry; undo acts on the newer one only", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-later-c1").click(); // c1 (rank 1) leaves — c2 (rank 2) opens next
    await expect(page.getByTestId("decision-card-c2")).toBeVisible();
    await page.getByTestId("decision-primary-c2").click();
    await expectUndoToast(page, "Approved · Reply to Andy, in Gmail Drafts");

    await undo(page);
    await expect(page.getByTestId("decision-card-c2")).toBeVisible(); // c2 restored
    const state = await db(page);
    expect(state.actions.find((a: { id: string }) => a.id === "c1").state).toBe("later"); // c1 stayed answered — its entry was superseded, not fired
  });
});

test.describe("TD-03 From your EA", () => {
  test("Block it collapses to the fixed result line", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("insight-block").click();
    await expect(page.getByTestId("insight-result")).toContainText("Blocked 9 to 12 tomorrow. The EA will hold it.");
  });

  test("Leave it collapses to the left-open line", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("insight-leave").click();
    await expect(page.getByTestId("insight-result")).toContainText("Left open. The EA will not ask again this week.");
  });
});

test.describe("FS-02 focus narrows Needs you", () => {
  test("selecting Work sends ?focus=work and resets the open card to the first in focus", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("focus-chips").getByText("Work", { exact: true }).click();

    await expect
      .poll(async () => (await calls(page)).some((c) => c.method === "getToday" && c.args.some((a) => typeof a === "object" && a != null && (a as { focus?: string }).focus === "work")))
      .toBe(true);
    await expect(page.getByTestId("decision-card-c2")).toBeVisible(); // c2 is rank-first among work-focus cards
    await expect(page.getByTestId("decision-card-c1")).toHaveCount(0);
  });
});

/**
 * CD-05 / UX-H (carried from V2.1) — a phone waiting row keeps enough title to
 * tell it from the row above.
 *
 * At 393 the row was type column · title · short expiry · verb, and the title
 * kept about ninety pixels: "Dev call Thur…", "Gym Wednes…". Two clash cards
 * truncated to the same twelve characters, so the list could not be read
 * without opening each row — which is the one thing a waiting list is for.
 *
 * "Shows at least twenty characters" is measured, not counted from the DOM:
 * the text node holds the whole title whatever is painted, because the
 * ellipsis is CSS. `scrollWidth / length` is the average character advance for
 * this exact string in this exact font, so `clientWidth / advance` is how many
 * of its characters actually fit.
 */
test.describe("CD-05 · the phone waiting row keeps its title (UX-H)", () => {
  test("every waiting row shows at least twenty characters of its title at 393", async ({ page }) => {
    test.skip(test.info().project.name !== "w393-light", "the defect and the fix are phone-width");
    await openUnlocked(page);

    // the TITLE element, not the pressable around it: the ellipsis lives on
    // the text node, so the pressable never overflows and measuring it would
    // report the whole string as visible on a row that shows twelve characters
    const rows = page.locator('[data-testid^="waiting-title-"]');
    const count = await rows.count();
    // the fixture has more than one waiting row, or this proves nothing
    expect(count).toBeGreaterThan(1);

    const tooShort: string[] = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const visible = await row.evaluate((el) => {
        const node = el as HTMLElement;
        const text = node.textContent ?? "";
        if (text.length === 0) return { text, fits: 0 };
        // the widest box the title is painted into, and the advance per
        // character of this string in this font
        const advance = node.scrollWidth / text.length;
        return { text, fits: advance > 0 ? Math.floor(node.clientWidth / advance) : 0 };
      });
      const keeps = Math.min(visible.fits, visible.text.length);
      if (keeps < 20) tooShort.push(`${visible.text.slice(0, 30)} → ${keeps} characters`);
    }

    expect(tooShort).toEqual([]);
  });

  test("the expiry sits under the title on the phone, not beside it", async ({ page }) => {
    test.skip(test.info().project.name !== "w393-light", "the two-line row is phone-only");
    await openUnlocked(page);

    // the title TEXT, not the pressable: the pressable wraps both lines, so
    // its box contains the expiry and the comparison would always fail
    const title = page.locator('[data-testid^="waiting-title-"]').first();
    const expiry = page.locator('[data-testid^="waiting-expiry-"]').first();
    const t = await title.boundingBox();
    const e = await expiry.boundingBox();
    expect(t).not.toBeNull();
    expect(e).not.toBeNull();
    // under, not beside: the expiry's top is at or below the title's bottom
    expect(e!.y).toBeGreaterThanOrEqual(t!.y + t!.height - 2);
  });

  test("the type column is sized to the widest type present, and never under 48", async ({ page }) => {
    await openUnlocked(page);
    const types = page.locator('[data-testid^="waiting-type-"]');
    const count = await types.count();
    expect(count).toBeGreaterThan(1);

    const widths: number[] = [];
    for (let i = 0; i < count; i++) {
      const box = await types.nth(i).boundingBox();
      widths.push(box!.width);
    }
    // one column, not a ragged edge: every label is the same width
    expect(new Set(widths.map((w) => Math.round(w))).size).toBe(1);
    expect(Math.round(widths[0])).toBeGreaterThanOrEqual(48);

    // and no type is clipped inside it
    const clipped = await types.evaluateAll((els) => els.filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1).map((el) => el.textContent ?? ""));
    expect(clipped).toEqual([]);
  });
});

/**
 * A4R9-01/02 (A-4 round 9) — the desktop keys A, R and L answer the open card
 * exactly as its buttons do, and only where its buttons are there to press: on
 * Today, with nothing open over it, online, with no modifier held, and not at a
 * focused control outside the card. They answered Today's card from Brain, under
 * Ctrl+A and Ctrl+L, over an open dialog and offline — typing "all ok" at the
 * Send button Brain's field leaves focused answered every open card — and A
 * approved with no option after option 2 was picked, which the server reads as
 * the recommended one while the toast announced option 2.
 */
test.describe("A4R9-01/02 · the A, R and L keys", () => {
  const cardState = async (page: import("@playwright/test").Page, id: string) =>
    ((await db(page)).actions as { id: string; state: string }[]).find((a) => a.id === id)?.state;
  const blur = (page: import("@playwright/test").Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const setOnline = (page: import("@playwright/test").Page, v: boolean) =>
    page.evaluate((on) => (window as unknown as { __JSTACK__: { setOnline: (v: boolean) => void } }).__JSTACK__.setOnline(on), v);
  // WPC-5b: C-5 gates the letter deck to the Expanded (non-phone) layout
  // (A4R10-07) - theme/useLayout.ts's own 768 boundary, matching helpers.ts's
  // densityOf. At w393-light the deck does not exist to answer with; these
  // cases only prove the deck's behaviour where the deck is on.
  const isExpanded = (projectName: string) => pickProject(projectName).width >= 768;

  test("they answer nothing from another tab, at a control outside the card, under a modifier, over a dialog or offline", async ({ page }, testInfo) => {
    await openUnlocked(page);
    await expect(page.getByTestId("decision-card-c1")).toBeVisible();

    // from another tab, and at the Send button Brain's field leaves focused
    await gotoTab(page, "brain");
    await page.getByTestId("dump-input").fill("A4R9 a line");
    await page.getByTestId("dump-send").click();
    await page.keyboard.type("all ok, really");
    await blur(page);
    await page.keyboard.press("a");
    await page.keyboard.press("l");
    await gotoTab(page, "today");
    expect(await cardState(page, "c1")).toBe("open");

    // under a modifier: Ctrl+A selects, Ctrl+L is the address bar
    await blur(page);
    for (const k of ["Control+a", "Control+l", "Alt+a", "Meta+a"]) await page.keyboard.press(k);
    expect(await cardState(page, "c1")).toBe("open");

    // over a dialog
    await page.getByTestId("needs-you-history").click();
    await expect(page.getByTestId("history-dialog")).toBeVisible();
    await page.keyboard.press("a");
    await page.getByTestId("history-dialog-close").click();
    expect(await cardState(page, "c1")).toBe("open");

    // offline, where the buttons say "needs a connection"
    await setOnline(page, false);
    await blur(page);
    await page.keyboard.press("a");
    expect(await cardState(page, "c1")).toBe("open");
    await setOnline(page, true);

    // and where its buttons are there to press, it answers - at the Expanded
    // layout only (A4R10-07/WPC-5b); at the phone width the deck is off and
    // this is one more case of "a control outside the card", same as the rest
    // of this test
    await blur(page);
    await page.keyboard.press("a");
    if (isExpanded(testInfo.project.name)) {
      await expect.poll(() => cardState(page, "c1")).toBe("answered");
    } else {
      await page.waitForTimeout(300);
      expect(await cardState(page, "c1")).toBe("open");
    }
  });

  test("A approves the option the card shows as picked, as its button does", async ({ page }, testInfo) => {
    await openUnlocked(page);
    await page.getByTestId("decision-opt-c1-2").click();
    await page.keyboard.press("a");
    if (isExpanded(testInfo.project.name)) {
      await expectToast(page, "Went with option 2 · Dev call");
      const history = ((await db(page)).actions as { id: string; history: { verb: string; option?: number }[] }[]).find((a) => a.id === "c1")?.history ?? [];
      expect(history.at(-1)).toEqual(expect.objectContaining({ verb: "approve", option: 2 }));
    } else {
      // the letter deck is Expanded-layout only (A4R10-07/WPC-5b) - the option
      // pick stands, but "a" does not act on it at the phone width
      await page.waitForTimeout(300);
      expect(await cardState(page, "c1")).toBe("open");
    }
  });

  test("R revises a card that is not a quote, as its button does; it never opens the quote editor", async ({ page }, testInfo) => {
    await openUnlocked(page);
    await blur(page);
    await page.keyboard.press("r");
    if (isExpanded(testInfo.project.name)) {
      await expectToast(page, /Sent back to revise/);
      await expect(page.getByTestId("revise-dialog")).toHaveCount(0);
    } else {
      // the letter deck is Expanded-layout only (A4R10-07/WPC-5b)
      await page.waitForTimeout(300);
      expect(await cardState(page, "c1")).toBe("open");
    }
  });

  test("A4R9-10: Ctrl+Z undoes only an undo the toast still offers", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-primary-c1").click();
    await expectUndoToast(page);
    // a plain toast takes the undo's place: its Undo button is gone from the screen
    await page.getByTestId("waiting-open-c3").click();
    await page.getByTestId("decision-copy-c3-ref").click();
    await expectToast(page, "Copied");
    await blur(page);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    expect(await cardState(page, "c1")).toBe("answered");
  });

  // A-4 round 10 — the gate reads the screen (A4R10-01), the verbs outside the
  // card wait for a connection too (A4R10-04), and the halves round 10 found
  // unguarded (A4R10-06)
  test("A4R10-01: with the task card open over Today, or Needs you collapsed, the keys answer nothing", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("your-task-cb-t1").click();
    await page.getByTestId("complete-confirm-no").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await blur(page);
    await page.keyboard.press("a");
    expect(await cardState(page, "c1")).toBe("open");
    await page.getByTestId("task-detail-close").click();
    await expect(page.getByTestId("task-detail")).toHaveCount(0);

    await page.getByTestId("disclose-needs-you").click();
    await expect(page.getByTestId("decision-card-c1")).toHaveCount(0);
    await blur(page);
    await page.keyboard.press("a");
    expect(await cardState(page, "c1")).toBe("open");
  });

  test("A4R10-04: offline, the waiting row's verb and the card's Never and Teach are off, as its buttons are", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-more-c1").click();
    await setOnline(page, false);
    for (const id of ["waiting-verb-c2", "decision-never-c1", "decision-teach-c1"]) {
      await expect(page.getByTestId(id)).toHaveAttribute("aria-disabled", "true");
      // and a press gets through to nothing: forced past Playwright's own aria-disabled guard
      await page.getByTestId(id).click({ force: true });
    }
    await page.waitForTimeout(300);
    expect(await cardState(page, "c2")).toBe("open");
    expect(await cardState(page, "c1")).toBe("open");
    await setOnline(page, true);
  });

  test("A4R10-06: a held key answers nothing, and neither does a key at a control outside the card", async ({ page }) => {
    await openUnlocked(page);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", repeat: true, bubbles: true })));
    expect(await cardState(page, "c1")).toBe("open");
    // a control on Today that is not the card's: the calendar's view switch keeps the focus it was clicked into
    await page.getByTestId("cal-seg").getByRole("tab", { name: "3 days" }).click();
    await page.keyboard.press("a");
    await page.waitForTimeout(300);
    expect(await cardState(page, "c1")).toBe("open");
  });

  /**
   * A-4 round 11 (A4R11-01). A verb's write reloads its list and the answered
   * row leaves within a frame, so the next row takes its screen position and
   * the open card's slot. A double-click, a double-tap or a second press
   * because the first seemed not to register then answered a card nobody had
   * read — and the one undo entry offered to take back the SECOND write.
   */
  test("A4R11-01: a second press at the same point answers nothing — the row that moved into it is not the one pressed", async ({ page }) => {
    await openUnlocked(page);
    const box = await page.getByTestId("waiting-verb-c2").boundingBox();
    const [x, y] = [box!.x + box!.width / 2, box!.y + box!.height / 2];
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);
    await page.mouse.click(x, y); // c3's verb is under the pointer by now
    await page.waitForTimeout(400);
    expect(await cardState(page, "c2")).toBe("answered");
    expect(await cardState(page, "c3")).toBe("open");
  });

  test("A4R11-01: a key pressed twice answers the card that was open, not the one promoted into its slot", async ({ page }, testInfo) => {
    await openUnlocked(page);
    await blur(page);
    await page.keyboard.press("a");
    await page.waitForTimeout(200);
    await page.keyboard.press("a");
    await page.waitForTimeout(400);
    if (isExpanded(testInfo.project.name)) {
      expect(await cardState(page, "c1")).toBe("answered");
      expect(await cardState(page, "c2")).toBe("open");
    } else {
      // the letter deck is Expanded-layout only (A4R10-07/WPC-5b) - neither
      // press acts, so nothing is promoted into anything
      expect(await cardState(page, "c1")).toBe("open");
      expect(await cardState(page, "c2")).toBe("open");
    }
  });

  test("A4R10-06: Ctrl+Z with the undo toast on the screen undoes", async ({ page }) => {
    await openUnlocked(page);
    await page.getByTestId("decision-primary-c1").click();
    await expectUndoToast(page);
    await blur(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => cardState(page, "c1")).toBe("open");
  });
});
