/**
 * BR-01..05, SEC-12, FS-02 (brain half) — Brain's entry (dump, Talk,
 * Chat, Find) and Latest in.
 */
import { assertCleanConsole, calls, clickSettingsEntry, db, expect, gotoTab, openUnlocked, test } from "../helpers";

async function openBrain(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "brain");
  return log;
}

test.describe("BR-01 dump — typed", () => {
  test("send posts, toasts, and the new row appears in Latest in", async ({ page }) => {
    const log = await openBrain(page);
    await page.getByTestId("dump-input").fill("Buy new hiking boots before the trip");
    await page.getByTestId("dump-send").click();
    await expect(page.getByTestId("toast")).toContainText("In. Filing itself · check Latest in");
    await expect(page.getByTestId("latest-in")).toContainText("Buy new hiking boots before the trip");
    await expect(page.getByTestId("latest-in")).toContainText("→ filing · Librarian");
    assertCleanConsole(log);
  });

  test("empty is blocked with 'Type or dictate first'", async ({ page }) => {
    await openBrain(page);
    await expect(page.getByTestId("dump-send")).toHaveAttribute("aria-disabled", "true");
    // NC-01/QA-01: a disabled control still handles a tap to explain why —
    // force past Playwright's own aria-disabled actionability guard.
    await page.getByTestId("dump-send").click({ force: true });
    await expect(page.getByTestId("toast")).toContainText("Type or dictate first");
  });
});

test.describe("BR-03 Talk with EA and Chat", () => {
  test("Talk opens the conversation; with liveVoice off it says so instead", async ({ page }) => {
    // V-2 turned `liveVoice` ON in the mock, because there is now something
    // behind it — the scripted server. So the honest line is the OTHER case,
    // reached the way every other capability is (GL-08's rig), and both are
    // asserted here rather than one of them quietly disappearing.
    await openBrain(page);
    await page.getByTestId("talk-with-ea").click();
    await expect(page.getByTestId("talk-screen")).toBeVisible();
    await expect(page.getByTestId("talk-orb")).toBeVisible();
    await expect(page.getByTestId("talk-honest-line")).toHaveCount(0);
    await page.getByTestId("talk-screen").press("Escape");

    await page.evaluate(() => (window as unknown as { __JSTACK__: { setCapability: (k: string, v: boolean) => Promise<void> } }).__JSTACK__.setCapability("liveVoice", false));
    await page.getByTestId("talk-with-ea").click();
    await expect(page.getByTestId("talk-honest-line")).toBeVisible();
    await expect(page.getByTestId("talk-orb")).toHaveCount(0);
  });

  // V-2 renamed "Chat" to "Dictate to EA" (TS-04) — the surface and its
  // testIDs with it. BR-03's claim is unchanged and still asserted here:
  // the entry sends `POST /chat` and renders the reply with its sources.
  // Recorded in 02_ACCEPTANCE_TESTS_v22.md §4.
  test("Dictate sends POST /chat and renders the reply row with sources", async ({ page }) => {
    await openBrain(page);
    await page.getByTestId("brain-dictate").click();
    await page.getByTestId("dictate-input").fill("Call Steve about Bali before Friday");
    await page.getByTestId("dictate-dialog").getByLabel("Send").click();
    await expect(page.getByTestId("dictate-thread")).toContainText("Got it");
    await expect(page.getByTestId("dictate-thread")).toContainText("Call Steve about Bali before Friday");

    const c = await calls(page);
    expect(c.some((x) => x.method === "postChat")).toBe(true);
  });
});

test.describe("BR-04 Find", () => {
  test("the placeholder fits the field it is in, at this project's width", async ({ page }) => {
    // ux-review round 15 D5, still open at Stage 4: "Find · what did Andy say
    // about the memory layer?" is sliced through its last letterform at the
    // field's edge on the phone, no ellipsis, butting the send button. A
    // placeholder that does not fit is a placeholder that says something else.
    await openBrain(page);
    const fit = await page.getByTestId("find-input").evaluate((el) => {
      const input = el as HTMLInputElement;
      const cs = getComputedStyle(input);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const text = ctx.measureText(input.placeholder ?? "").width;
      const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { placeholder: input.placeholder, over: Math.max(0, Math.round(text - room)) };
    });
    expect(fit.placeholder).toMatch(/^Find · /);
    expect(fit).toEqual({ placeholder: fit.placeholder, over: 0 });
  });

  test("empty on open, no search call; submit shows an answer card and results", async ({ page }) => {
    await openBrain(page);
    await expect(page.getByTestId("find-answer")).toHaveCount(0);
    const before = await calls(page);
    expect(before.some((c) => c.method === "getBrainSearch")).toBe(false);

    await page.getByTestId("find-input").fill("Steve");
    await page.getByTestId("find-input").press("Enter");
    await expect(page.getByTestId("find-answer")).toBeVisible();
    await expect(page.getByTestId("find-answer")).toContainText("confidence high");
    await expect(page.getByTestId("find-answer")).toContainText("0.4s");
    await expect(page.getByTestId("find-results")).toBeVisible();
  });
});

test.describe("BR-05 Latest in", () => {
  test("edit opens the item editor; saving appends a version", async ({ page }) => {
    await openBrain(page);
    await page.getByTestId("edit-item-b1").click();
    await expect(page.getByTestId("item-editor")).toBeVisible();
    await expect(page.getByTestId("item-editor-versions")).toHaveCount(0);

    await page.getByTestId("item-editor-input").fill("Call Steve about Bali before Thursday");
    await page.getByTestId("item-editor-save").click();
    await expect(page.getByTestId("item-editor")).toHaveCount(0);
    await expect(page.getByTestId("latest-in")).toContainText("Call Steve about Bali before Thursday");

    await page.getByTestId("edit-item-b1").click();
    await expect(page.getByTestId("item-editor-versions")).toBeVisible();
  });
});

test.describe("SEC-12 what the build can do, in Help", () => {
  /**
   * V-1: this used to assert `help-stt-engine`, the line naming which speech
   * engine `lib/stt.ts` had resolved. That file is gone — ADR-49 makes
   * `lib/mic.ts` the one owner — and what a person needs to know about the
   * microphone is now told where they use it: the field's button state, the
   * banner, and the honest line when it is unavailable (MC-02, MC-03, MC-08).
   *
   * The case is kept rather than deleted because SEC-12's real claim is that
   * Help says what this build can and cannot do, and that is still true and
   * still worth a gate. Recorded in `02_ACCEPTANCE_TESTS_v22.md` §4.
   */
  test("Help opens and lists the build's capabilities", async ({ page }, testInfo) => {
    // the Help button is desktop-only this row (RL-05: phone's header carries
    // Settings + Theme, not Arrange/Help — a phone entry point is row 16's
    // Settings sheet); same skip as GL-08 in shell.spec.ts.
    test.skip(testInfo.project.name === "w393-light", "Help has no phone entry point yet (row 16)");
    await openBrain(page);
    await page.getByTestId("header").getByLabel("Help").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await expect(page.getByTestId("help-dialog")).toContainText("What works in this build");
  });
});

test.describe("FS-02 focus (brain half)", () => {
  test("selecting Work sends ?focus=work to Brain's load", async ({ page }) => {
    await openBrain(page);
    await page.getByTestId("focus-chips").getByText("Work", { exact: true }).click();
    await expect
      .poll(async () => (await calls(page)).some((c) => c.method === "getBrainLatest" && c.args.some((a) => typeof a === "object" && a != null && (a as { focus?: string }).focus === "work")))
      .toBe(true);
  });
});

/**
 * RP-01..RP-06 (R-1) — the EA answers, and the answer has somewhere to live.
 *
 * The claim under all six: a question asked on the way to the car comes back
 * to you. V2.1 had nowhere for an answer to arrive — a capture went in and the
 * only evidence anything had happened to it was a routing chip.
 */
test.describe("RP-01 a question capture is answered", () => {
  test("a dump ending in '?' comes back as a reply, on the brain event", async ({ page }) => {
    const log = await openBrain(page);
    await page.getByTestId("dump-input").fill("What did Andy say about the V2 start date?");
    await page.getByTestId("dump-send").click();

    // the row says "question" straight away — the app knows the KIND before it
    // has the answer, which is the whole reason the routing is structured
    // N-1: the ROUTING is its own run now (`latest-routing-*`), accent ink,
    // with the source and the time muted beside it — BR-05 says routing chips
    // are accent and the whole line used to be, which made the time read as
    // tappable. The claim is unchanged; the run that carries it is named.
    const row = page.locator("[data-testid^='latest-routing-dump-']").first();
    await expect(row).toContainText("question");

    // and the answer arrives on its own, without a reload: the mock emits a
    // `brain` server event and `lib/serverEvents.ts` refetches the replies
    await expect(page.getByTestId("brain-replies-section")).toContainText("Librarian", { timeout: 10_000 });
    await expect(row).toContainText("replied");
    assertCleanConsole(log);
  });
});

test.describe("RP-02 Brain › Replies", () => {
  test("unread first; a row opens the detail with its sources; opening marks it read", async ({ page }) => {
    const log = await openBrain(page);

    // r1 is unread and r2 is read, and r1 is also the newer — so this alone
    // would not prove the order. `postChat` is not involved and the fixture is
    // the whole list, so the assertion is on both rows in order.
    const rows = page.locator("[data-testid^='reply-act-']");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("data-testid", "reply-act-r1");
    await expect(rows.nth(1)).toHaveAttribute("data-testid", "reply-act-r2");
    await expect(page.getByTestId("reply-r1")).toContainText("New");

    await rows.nth(0).click();
    await expect(page.getByTestId("reply")).toBeVisible();
    await expect(page.getByTestId("reply-text")).toContainText("passport");
    // the sources are the half that makes an answer checkable
    await expect(page.getByTestId("reply-source-task:t1")).toBeVisible();
    await page.getByTestId("reply-close").click();

    // opening IS reading — on the server, not just on screen
    await expect
      .poll(async () => ((await db(page)).replies as { id: string; read: boolean }[]).find((r) => r.id === "r1")?.read)
      .toBe(true);
    expect((await calls(page)).some((c) => c.method === "patchReply")).toBe(true);
    assertCleanConsole(log);
  });

  test("a source opens the record it names, through the one openRef", async ({ page }) => {
    await openBrain(page);
    await page.locator("[data-testid^='reply-act-']").first().click();
    await page.getByTestId("reply-source-task:t1").click();
    await expect(page.getByTestId("task-detail")).toBeVisible();
  });
});

test.describe("RP-03 Today › From your EA", () => {
  test("the newest unread reply is a second card; Dismiss marks it read and the card goes", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "today");

    await expect(page.getByTestId("reply-card")).toBeVisible();
    await expect(page.getByTestId("reply-card-text")).toContainText("passport");

    await page.getByTestId("reply-card-dismiss").click();
    // no card, and no "no replies" row in its place: an empty state present
    // every day to report that nothing happened is a row that teaches you to
    // stop looking
    await expect(page.getByTestId("reply-card")).toHaveCount(0);
    await expect
      .poll(async () => ((await db(page)).replies as { id: string; read: boolean }[]).find((r) => r.id === "r1")?.read)
      .toBe(true);
    assertCleanConsole(log);
  });

  test("Open opens the same detail the Replies row does", async ({ page }) => {
    await openUnlocked(page);
    await gotoTab(page, "today");
    await page.getByTestId("reply-card-open").click();
    await expect(page.getByTestId("reply")).toBeVisible();
    await expect(page.getByTestId("reply-text")).toContainText("passport");
  });
});

test.describe("RP-04 the push and its toggle", () => {
  test("a notification's ref opens the reply it was about", async ({ page }) => {
    // What `public/sw.js` does with `{ tab: "brain", ref: "r1" }`: it focuses
    // the tab and navigates it to exactly this URL (`notificationclick`,
    // sw.js:178). The test build registers no worker (P-1), so the URL is what
    // is driven here; the handler that builds it is PU-04's.
    const log = await openUnlocked(page);
    await page.goto("/brain?ref=r1");
    await expect(page.getByTestId("reply")).toBeVisible();
    await expect(page.getByTestId("reply-text")).toContainText("passport");
    // and the parameter is spent: a refresh tomorrow must not reopen it
    expect(new URL(page.url()).searchParams.get("ref")).toBeNull();
    assertCleanConsole(log);
  });

  test("the group exists with four channel switches, iPhone and iPad on", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    const row = page.getByTestId("notif-row-ng10");
    await row.scrollIntoViewIfNeeded();
    await expect(row).toContainText("Replies from your EA");
    await expect(page.getByTestId("notif-ng10-iphone")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("notif-ng10-ipad")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("notif-ng10-pc")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("notif-ng10-telegram")).toHaveAttribute("aria-checked", "false");
  });

  test("with every channel off, the subscription the mock records does not carry the group", async ({ page }) => {
    await openUnlocked(page);
    await clickSettingsEntry(page);
    await page.getByTestId("notif-row-ng10").scrollIntoViewIfNeeded();
    await page.getByTestId("notif-ng10-iphone").click();
    await page.getByTestId("notif-ng10-ipad").click();
    await expect
      .poll(async () => ((await db(page)).notificationGroups as { id: string; devices: Record<string, boolean> }[]).find((g) => g.id === "ng10")?.devices)
      .toEqual({ iphone: false, ipad: false, pc: false, telegram: false });
    // `wantedGroups` is "every group with any device ticked", so with none
    // ticked the group is not in the list a subscription carries and no push
    // for it can be addressed to this device
    const subs = (await db(page)).pushSubscriptions as { groups: string[] }[];
    for (const sub of subs) expect(sub.groups).not.toContain("ng10");
  });
});

test.describe("RP-05 a Dictate turn is a reply too", () => {
  test("the EA's answer in the thread is listed under Replies, and arrives read", async ({ page }) => {
    const log = await openBrain(page);
    await page.getByTestId("brain-dictate").click();
    await page.getByTestId("dictate-input").fill("Call Steve about Bali before Friday");
    await page.getByTestId("dictate-dialog").getByLabel("Send").click();
    await expect(page.getByTestId("dictate-thread")).toContainText("Got it");
    await page.getByTestId("dictate-dialog-close").click();

    const turnReply = async () => ((await db(page)).replies as { toCaptureId: string; read: boolean }[]).find((r) => r.toCaptureId.startsWith("chat-"));
    await expect.poll(async () => (await turnReply())?.read).toBe(true);

    // read, so it is NOT on Today's card: he was looking at the thread when it
    // arrived, and badging somebody for what they just read is how a badge
    // stops meaning anything
    await gotoTab(page, "today");
    await expect(page.getByTestId("reply-card-text")).not.toContainText("Got it");
    assertCleanConsole(log);
  });
});

test.describe("RP-06 Latest in reads as one meta line and its tags", () => {
  test("routing, source and time on one line; silo, labels and sensitivity as tags", async ({ page }) => {
    const log = await openBrain(page);

    // N-1 (§4, A-93): TWO RUNS, ONE LINE. The routing is accent ink and the
    // source and time are muted (BR-05, hard rule 20) — so the text lives in
    // two nodes now. RP-06's claim is that they read as ONE LINE, which is a
    // stronger thing than one node, so it is asserted as such: the parts are
    // where they belong AND they share a baseline.
    await expect(page.getByTestId("latest-routing-b1")).toContainText("task → Twenty");
    await expect(page.getByTestId("latest-meta-b1")).toContainText("voice · Telegram");
    const routingBox = (await page.getByTestId("latest-routing-b1").boundingBox())!;
    const metaBox = (await page.getByTestId("latest-meta-b1").boundingBox())!;
    expect(Math.abs(routingBox.y - metaBox.y)).toBeLessThan(routingBox.height);
    await expect(page.getByTestId("latest-tags-b1")).toHaveText(/family.*kids.*legal.*sensitive/s);
    await expect(page.getByTestId("latest-tags-b2")).toHaveText(/personal.*open/s);
    await expect(page.getByTestId("latest-tags-b3")).toHaveText(/personal.*money.*journal/s);

    // the three TONES are the point: three different kinds of fact read as one
    // list when they share a colour
    const tones = await page
      .getByTestId("latest-tags-b1")
      .locator("[data-tag-tone]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-tag-tone")));
    expect(tones).toEqual(["accent", "neutral", "neutral", "alert"]);
    assertCleanConsole(log);
  });
});
