/**
 * MC-01..MC-08 — the microphone (V-1, ADR-49).
 *
 * Josh, item 11 and iPhone item 2: "Mic staying on and I don't know how to
 * turn it off — this must never happen." Three things were true before this
 * row and each has a case here: dictation filed straight to Brain without the
 * words ever appearing in the field, the only indicator was a bar in the
 * corner of a desktop window (on a phone it replaced the tab bar, taking away
 * the way out), and an unsupported mime type on an iPhone threw into a
 * swallowed catch and left the session "listening" with no exit.
 *
 * The rig drives the BROWSER APIs rather than an injected engine
 * (`__JSTACK__.mic`): `lib/mic.ts` reads exactly what a real browser offers,
 * so stubbing `getUserMedia`, `SpeechRecognition` and `MediaRecorder` drives
 * the real code path. A mock route could not reach any of them, which is why
 * the old `stt` seam could never test the case Josh actually hit.
 *
 * Superseded V2 IDs (VO-01..VO-04) and their copy are recorded in
 * `02_ACCEPTANCE_TESTS_v22.md` §4. VO-05 is unchanged and still here.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- window.__JSTACK__.mic is test-only, untyped by design */
import { assertCleanConsole, expect, gotoTab, openUnlocked, pickProject, test } from "../helpers";

type Page = import("@playwright/test").Page;

/** install the browser's microphone APIs, as this browser would offer them */
async function useMic(page: Page, opts: Record<string, unknown> = {}) {
  await page.evaluate((o) => (window as any).__JSTACK__.mic.use(o), opts);
}
const partial = (page: Page, text: string) => page.evaluate((t) => (window as any).__JSTACK__.mic.partial(t), text);
const final = (page: Page, text: string) => page.evaluate((t) => (window as any).__JSTACK__.mic.speak(t), text);
const micState = (page: Page) => page.evaluate(() => (window as any).__JSTACK__.mic.state());

async function openBrainWithMic(page: Page, opts: Record<string, unknown> = {}) {
  const log = await openUnlocked(page);
  await gotoTab(page, "brain");
  await useMic(page, opts);
  return log;
}

test.describe("MC-02 the button says what the microphone is doing", () => {
  test("resting, then Listening, then the word goes when it stops", async ({ page }) => {
    const log = await openBrainWithMic(page);
    const button = page.getByTestId("dump-mic");

    // at rest it is a glyph and nothing else — no word, no live tone
    await expect(button).toHaveAttribute("data-mic-state", "off");
    await expect(page.getByTestId("dump-mic-state")).toHaveCount(0);

    await button.click();
    await expect(button).toHaveAttribute("data-mic-state", "listening");
    await expect(page.getByTestId("dump-mic-state")).toHaveText("Listening");

    // the SAME button stops it — the first thing Josh asked for
    await button.click();
    await expect(button).toHaveAttribute("data-mic-state", "off");
    await expect(page.getByTestId("dump-mic-state")).toHaveCount(0);
    assertCleanConsole(log);
  });
});

test.describe("MC-04 the transcript goes into the field, and nothing is filed until send", () => {
  test("interim streams in, the final replaces it, and the capture waits for the arrow", async ({ page }) => {
    const log = await openBrainWithMic(page);
    const field = page.getByTestId("dump-input");

    await page.getByTestId("dump-mic").click();
    await partial(page, "Ring the school about");
    await expect(field).toHaveValue("Ring the school about");

    await partial(page, "Ring the school about the Term 4");
    await expect(field).toHaveValue("Ring the school about the Term 4");

    // the final REPLACES the interim rather than appending to it
    await final(page, "Ring the school about the Term 4 dates");
    await expect(field).toHaveValue("Ring the school about the Term 4 dates");

    // and none of it has been filed: the words are still in the field, and
    // Latest in has not gained them. Dictation used to POST on stop.
    await expect(page.getByTestId("latest-in")).not.toContainText("Term 4 dates");

    await page.getByTestId("dump-send").click();
    await expect(page.getByTestId("latest-in")).toContainText("Term 4 dates");
    await expect(field).toHaveValue("");
    assertCleanConsole(log);
  });
});

test.describe("MC-03 an open microphone is visible on every tab, and stoppable from there", () => {
  test("the banner follows you across tabs and its Stop ends the session", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    const log = await openBrainWithMic(page);

    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("mic-banner")).toBeVisible();
    await expect(page.getByTestId("mic-banner-text")).toHaveText("Mic on · listening for Brain");

    // the point of the banner: it is still there when Brain is not
    await gotoTab(page, "tasks");
    await expect(page.getByTestId("mic-banner")).toBeVisible();
    await gotoTab(page, "agents");
    await expect(page.getByTestId("mic-banner")).toBeVisible();

    // the desktop health line says it too (MC-03); the phone has no rail
    if (width >= 768) await expect(page.getByTestId("rail-health")).toContainText("mic on");

    // "● Listening · JSTACK" so six open tabs can be told apart
    expect(await page.title()).toBe("● Listening · JSTACK");

    await page.getByTestId("mic-banner-stop").click();
    await expect(page.getByTestId("mic-banner")).toBeHidden();
    expect(await micState(page)).toBe("off");
    expect(await page.title()).toBe("JSTACK");
    assertCleanConsole(log);
  });

  test("the journal names its own purpose, so the banner is never guessed from context", async ({ page }) => {
    const log = await openUnlocked(page);
    await gotoTab(page, "today");
    await useMic(page);
    await page.getByTestId("journal-mic").scrollIntoViewIfNeeded();
    await page.getByTestId("journal-mic").click();
    await expect(page.getByTestId("mic-banner-text")).toHaveText("Mic on · listening for your journal");
    await page.getByTestId("mic-banner-stop").click();
    assertCleanConsole(log);
  });
});

test.describe("MC-08 unavailable is honest, and never stuck in listening", () => {
  test("a denied permission says so, never enters listening, and the typing path still works", async ({ page }) => {
    const log = await openBrainWithMic(page, { denied: true });

    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("dump-mic-error")).toContainText("Microphone permission needed");
    expect(await micState(page)).toBe("error");
    await expect(page.getByTestId("dump-mic")).not.toHaveAttribute("data-mic-state", "listening");
    await expect(page.getByTestId("mic-banner")).toBeHidden();

    // the page is not stuck: typing and sending still work
    await page.getByTestId("dump-input").fill("Typing still works");
    await page.getByTestId("dump-send").click();
    await expect(page.getByTestId("latest-in")).toContainText("Typing still works");
    assertCleanConsole(log);
  });

  test("no speech recognition and no supported mime reads 'Mic unavailable here · type instead'", async ({ page }) => {
    // Josh's iPhone: Safari has no webm/opus, and the hard-coded mime threw
    // into a `.catch(() => null)` that left the UI listening for ever
    const log = await openBrainWithMic(page, { available: false, mime: null });

    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("dump-mic-error")).toHaveText("Mic unavailable here · type instead");
    expect(await micState(page)).toBe("error");
    assertCleanConsole(log);
  });

  test("no microphone at all names the reason", async ({ page }) => {
    const log = await openBrainWithMic(page, { noDevice: true });
    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("dump-mic-error")).toContainText("no microphone found");
    assertCleanConsole(log);
  });
});

test.describe("MC-06 the auto-stop, composed from the parameter", () => {
  test("the notice reads the value Settings holds, not a number written into the copy", async ({ page }) => {
    const log = await openBrainWithMic(page);

    // 15 is the parameter's own minimum: a value the table allows and that
    // nothing in the app's copy spells out. Set through the same action
    // Settings uses, so the PUT is exercised too.
    await page.evaluate(() => (window as any).__JSTACK__.setParameter("mic.autoStopSeconds", 15));

    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("dump-mic")).toHaveAttribute("data-mic-state", "listening");

    // it stops itself, without anyone touching it
    await expect(page.getByTestId("dump-mic")).toHaveAttribute("data-mic-state", "off", { timeout: 25_000 });

    // AND the notice carries the value. "15 seconds" appears nowhere in the
    // source: it is composed from the parameter (resolution #9), so this is
    // the assertion that the registry is read rather than decorative. The
    // default would have said "a minute".
    await expect(page.getByTestId("dump-mic-notice")).toHaveText("Mic off · nothing heard for 15 seconds");
    await expect(page.getByTestId("mic-banner")).toBeHidden();
    assertCleanConsole(log);
  });
});

test.describe("VO-05 no audio ever persisted", () => {
  test("localStorage carries no audio blob after a full dictation", async ({ page }) => {
    const log = await openBrainWithMic(page);
    await page.getByTestId("dump-mic").click();
    await final(page, "Check nothing gets stored");
    await page.getByTestId("dump-send").click();

    const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(stored).not.toMatch(/audio\/(webm|mp4)|base64,|blob:/);
    assertCleanConsole(log);
  });
});

/**
 * S6-02 / S6-18 (ux round, Stage 6) — while the mic was on, the app said so
 * three different ways at three widths: the desktop health line REPLACED its
 * own words with "mic on" (the attention state and the spend vanished), the
 * phone's line said nothing, and at 393 the demo watermark's chip painted over
 * the whole of the banner's message so the bar read as a lone "Stop" — the
 * warning JOSH_QA_v22 item 11 exists for, with no words on it.
 *
 * One state, one sentence: the health line keeps its words and appends
 * "· mic on" at every width; the banner is the pack's Bar on a desktop (60
 * tall, 14 in, and full width by Josh's own line — DISCREPANCIES 31) and sits
 * 14 in and 8 above the tab bar on a phone, where the mark yields the band.
 */
test.describe("S6-02 / S6-18 the mic banner is the pack's bar, and nothing shares its band", () => {
  test("the health line keeps its words and adds 'mic on'; the bar wears the Bar's metrics; the mark leaves the phone's band", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    const log = await openBrainWithMic(page);
    const health = page.getByTestId(width >= 768 ? "rail-health" : "header-health");
    await expect(health).toHaveText(/^(all healthy|needs attention) · \$\d+\.\d{2}$/);

    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("mic-banner")).toBeVisible();
    await expect(health).toHaveText(/^(all healthy|needs attention) · \$\d+\.\d{2} · mic on$/);

    const banner = (await page.getByTestId("mic-banner").boundingBox())!;
    const vp = page.viewportSize()!;
    if (width >= 768) {
      expect({ height: Math.round(banner.height), inset: Math.round(vp.height - (banner.y + banner.height)), left: Math.round(banner.x) }).toEqual({ height: 60, inset: 14, left: 200 + 14 });
      // the mark stays on a desktop — it is at the rail's foot, which the bar never reaches
      const mark = (await page.getByTestId("demo-watermark").boundingBox())!;
      const overlaps = mark.x < banner.x + banner.width && banner.x < mark.x + mark.width && mark.y < banner.y + banner.height && banner.y < mark.y + mark.height;
      expect({ markOverBanner: overlaps }).toEqual({ markOverBanner: false });
    } else {
      await expect(page.getByTestId("demo-watermark")).toHaveCount(0);
      const bar = (await page.getByTestId("tabbar").boundingBox())!;
      expect({ left: Math.round(banner.x), stepAboveBar: Math.round(bar.y - (banner.y + banner.height)) }).toEqual({ left: 14, stepAboveBar: 8 });
    }

    await page.getByTestId("mic-banner-stop").click();
    await expect(page.getByTestId("mic-banner")).toBeHidden();
    await expect(page.getByTestId("demo-watermark")).toBeVisible();
    await expect(health).toHaveText(/^(all healthy|needs attention) · \$\d+\.\d{2}$/);
    assertCleanConsole(log);
  });
});

/**
 * A4-03 (the A-4 audit) — the same rule the toast obeys, asked of the banner.
 *
 * B-160 gave the TOAST a band (`ui.toastInset`) and the tab page ends above
 * it. Nothing gave the mic banner one, so at 393 with the mic listening the
 * banner sat on `latest-open-b3` and `edit-item-b3` on Brain and ATE THE TAP:
 * the auditor clicked the row's own pixels and no dialog opened. LV-05's row
 * names the mic banner explicitly — "every floating box disjoint from every
 * control and text box with a toast, a sheet, Talk, the mic banner and Find
 * up" — and this is the case that was missing.
 *
 * The hit test is the claim; the geometry is why it fails. Both, because a
 * page that merely ends above the banner could still be covered by something
 * else, and a tap that lands could still be landing on the wrong thing.
 */
test.describe("A4-03 the page ends above the mic banner's band", () => {
  test("with the mic listening on Brain, the page's foot clears the banner and a covered row still answers a tap", async ({ page }) => {
    const log = await openBrainWithMic(page);
    await page.getByTestId("dump-mic").click();
    await expect(page.getByTestId("mic-banner")).toBeVisible();

    const banner = (await page.getByTestId("mic-banner").boundingBox())!;
    const tabPage = (await page.getByTestId("tab-screen-brain").boundingBox())!;
    expect(tabPage.y + tabPage.height + 8).toBeLessThanOrEqual(banner.y + 1);

    // and the control the banner used to cover opens what it says it opens
    const row = page.getByTestId("latest-open-b3");
    await row.scrollIntoViewIfNeeded();
    const box = (await row.boundingBox())!;
    const topmost = await page.evaluate(
      ([x, y]) => (document.elementsFromPoint(x, y)[0] as HTMLElement | undefined)?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] as const,
    );
    expect(topmost).not.toBe("mic-banner");
    await row.click();
    await expect(page.locator('[data-testid^="brain-item"]').first()).toBeVisible();
    assertCleanConsole(log);
  });
});
