/**
 * UX-01..03 — `Field` expands on focus.
 *
 * Josh, 6 Sep: "I don't want to be scrolling up and down a small text box
 * on my iPhone." On a touch width, focusing a multi-line field turns it
 * into a real editor — at least 40% of the viewport left above the soft
 * keyboard — and on desktop it grows where it stands.
 *
 * It grows IN PLACE rather than opening an overlay. The overlay was built
 * first and this board rejected it: seven dialogs put their Save or Send
 * button beside the field, and a `Modal` (the only portal that escapes the
 * ScrollViews that would clip it) buries them. `theme/ui/fields.tsx`'s
 * header and BUGLOG_v21.md B-06 carry the reasoning; the last test here is
 * the guard that keeps those buttons reachable.
 *
 * The soft keyboard is raised through the rig (`setKeyboardInset`) rather
 * than by a real one: Playwright cannot open a system keyboard, and UX-02
 * is entirely about the viewport that is *left* once one is up. The rig
 * writes the same `session.keyboardInset` that `lib/keyboard.ts` writes
 * from `visualViewport`, so the component cannot tell the difference.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertCleanConsole, expect, gotoTab, openUnlocked, pickProject, setKeyboardInset, test } from "../helpers";

/** a phone's soft keyboard, roughly, in CSS px */
const KEYBOARD = 300;

async function openDump(page: import("@playwright/test").Page) {
  const log = await openUnlocked(page);
  await gotoTab(page, "brain");
  return log;
}

test.describe("UX-01/UX-02 a focused multi-line field becomes the editor", () => {
  test("it takes at least 40% of the space above the keyboard, at full width, clear of it", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 1180, "touch widths only — desktop grows in place (UX-03)");

    const log = await openDump(page);
    await setKeyboardInset(page, KEYBOARD);

    const box = page.getByTestId("dump-input-box");
    const rest = (await box.boundingBox())!;
    const resting = rest.height;

    await page.getByTestId("dump-input").focus();
    // the resting field is a row; the focused one is an editor
    await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(resting);

    const viewport = page.viewportSize()!;
    const visible = viewport.height - KEYBOARD;
    const grown = (await box.boundingBox())!;

    expect(grown.height).toBeGreaterThanOrEqual(visible * 0.4 - 1);
    // it never hides under the keyboard
    expect(grown.y + grown.height).toBeLessThanOrEqual(viewport.height - KEYBOARD + 1);
    // it keeps the full width of its column — "content width", which at
    // 1024 is one column of a two-column page (393px), not the viewport
    expect(grown.width).toBeGreaterThanOrEqual(rest.width - 1);
    assertCleanConsole(log);
  });

  test("it grows with the content, stops at the ceiling, and scrolls inside itself", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 1180, "touch widths only");

    await openDump(page);
    await setKeyboardInset(page, KEYBOARD);
    await page.getByTestId("dump-input").focus();

    const viewport = page.viewportSize()!;
    const visible = viewport.height - KEYBOARD;
    const box = page.getByTestId("dump-input-box");
    const short = (await box.boundingBox())!.height;

    await page.getByTestId("dump-input").fill(Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of a long note about the week`).join("\n"));
    const tall = (await box.boundingBox())!.height;

    expect(tall).toBeGreaterThanOrEqual(short);
    // it stops growing and scrolls its own content rather than pushing the
    // page — the behaviour Josh asked for
    expect(tall).toBeLessThanOrEqual(visible * 0.85 + 1);
    const scrolls = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dump-input"]');
      return el != null && el.scrollHeight > el.clientHeight + 1;
    });
    expect(scrolls).toBe(true);
  });

  test("the field's own send control stays with it", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 1180, "touch widths only");

    await openDump(page);
    await setKeyboardInset(page, KEYBOARD);
    await page.getByTestId("dump-input").focus();
    await page.getByTestId("dump-input").fill("Ask the physio whether the knee work can start before the trip");

    const box = (await page.getByTestId("dump-input-box").boundingBox())!;
    const send = (await page.getByTestId("dump-send").boundingBox())!;
    // pinned at the foot of the grown field, not floating at its top
    expect(send.y).toBeGreaterThan(box.y + box.height / 2);
    expect(send.y + send.height).toBeLessThanOrEqual(box.y + box.height + 1);

    await page.getByTestId("dump-send").click();
    await expect(page.getByTestId("toast")).toContainText("In. Filing itself");
  });
});

test.describe("UX-01 blurring keeps your work", () => {
  test("text left behind keeps a preview and a way back in; empty keeps neither", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 1180, "touch widths only");

    await openDump(page);
    await page.getByTestId("dump-input").focus();
    await page.getByTestId("dump-input").fill("Book the physio before the trip");
    await page.getByTestId("dump-input").blur();

    await expect(page.getByTestId("dump-input")).toHaveValue(/physio/);
    await expect(page.getByTestId("dump-input-continue")).toBeVisible();

    // continue puts the caret back and grows it again
    const collapsed = (await page.getByTestId("dump-input-box").boundingBox())!.height;
    await page.getByTestId("dump-input-continue").click();
    await expect.poll(async () => (await page.getByTestId("dump-input-box").boundingBox())!.height).toBeGreaterThan(collapsed);

    await page.getByTestId("dump-input").fill("");
    await page.getByTestId("dump-input").blur();
    await expect(page.getByTestId("dump-input-continue")).toHaveCount(0);
  });
});

test.describe("UX-03 desktop grows in place", () => {
  test("focusing a field at 1366 does not take over the viewport", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width < 1180, "desktop widths only");

    const log = await openDump(page);
    const box = page.getByTestId("dump-input-box");
    const resting = (await box.boundingBox())!.height;

    await page.getByTestId("dump-input").focus();
    await page.getByTestId("dump-input").fill("A note typed on the desktop, where there is room for it");

    const after = (await box.boundingBox())!;
    await expect(page.getByTestId("dump-input-continue")).toHaveCount(0);
    // it may grow with the text, but never to the touch editor's 40% share
    expect(after.height).toBeLessThan(page.viewportSize()!.height * 0.4);
    expect(after.height).toBeGreaterThanOrEqual(resting - 1);
    assertCleanConsole(log);
  });
});

test.describe("UX-01 the surrounding controls stay reachable", () => {
  test("a dialog's own Send still works with the journal field focused", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 1180, "touch widths only");

    // this is the regression guard for the overlay that was tried first:
    // Close the day puts Send beside the field, not inside it
    await openUnlocked(page);
    await setKeyboardInset(page, KEYBOARD);
    await page.getByTestId("close-journal").focus();
    await page.getByTestId("close-journal").fill("Quiet day, good progress.");
    await page.getByTestId("close-day").getByLabel("Send", { exact: true }).click();
    await expect(page.getByTestId("close-journal")).toHaveText("");
  });
});

// A single-line field must NOT expand (a name or a numeric width taking
// over the screen would be a defect, not a fix). That is proven in
// tests/native/primitives.test.tsx instead of here: it depends only on the
// props `Field` is given, and reaching one of those fields through the UI
// would make a navigation-shaped test out of a props-shaped fact.

/**
 * TE-01..TE-06 (E-1) — Josh's text-entry findings, from the iPhone and the PC.
 *
 * "Focusing a field zooms the page" · "the mind dump box is a slot" · "the
 * editor goes behind the keyboard" · "a focused field on the PC shows nothing".
 *
 * The pack's body size is 12.5 and iOS Safari zooms any focused input under
 * 16px. TE-01 answered that in the head alone (`maximum-scale=1`) rather than
 * by a 16px input that would put one control off the type scale on every
 * screen — and on Josh's iPhone the mock built that morning still zoomed onto Brain's
 * field and Find, and stayed zoomed after Enter. v2.3.2 WPR-4 does both: the
 * head keeps `maximum-scale=1`, and every field renders at 16px or more on the
 * web. `design/DISCREPANCIES.md` row 23 records what the head costs Android.
 */
const BODY_PX = 12.5;
/** v2.3.2 WPR-4: iOS zooms the page onto a focused field under this size */
const NO_ZOOM_PX = 16;
const BODY_LINE = BODY_PX * 1.4;
/** `theme/ui/fieldEditor.ts` FIELD_PADDING — the box's own padding */
const FIELD_PADDING = 10;
/** `theme/tokens.ts` accentInk, per scheme */
const ACCENT_INK = { light: "rgb(74, 94, 112)", dark: "rgb(183, 200, 216)" };

test.describe("TE-01 a focused field never zooms the phone", () => {
  test("every field is 16px or more on the web, the head refuses the zoom, and the dump box rests tall", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    const log = await openDump(page);

    // The served head — the fix itself, on the build the browser is running.
    //
    // COUNTED, not just matched. Expo emits its own viewport meta and the
    // first cut of this row added a second one after it; the last meta in the
    // document wins, so `maximum-scale=1` was present in the file and inert in
    // the browser. Asserting "some meta contains it" passed while the page
    // still zoomed. One meta, and it is ours.
    const metas = page.locator('meta[name="viewport"]');
    await expect(metas).toHaveCount(1);
    expect(await metas.getAttribute("content")).toContain("maximum-scale=1");
    // WPR-4 (d): the keyboard resizes the content where a browser honours it, and the notch stays covered
    expect(await metas.getAttribute("content")).toContain("interactive-widget=resizes-content");
    expect(await metas.getAttribute("content")).toContain("viewport-fit=cover");

    // WPR-4 (a): every input on this screen is 16px or more, the size iOS does not zoom onto
    const sizes = await page.getByTestId("dump-input").evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(sizes)).toBeGreaterThanOrEqual(NO_ZOOM_PX);
    const findSize = await page.getByTestId("find-input").evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(findSize)).toBeGreaterThanOrEqual(NO_ZOOM_PX);

    // the mind-dump box is the main thing on the page: four lines on a phone,
    // three where the column shares the width (Josh's v3 note)
    const restLines = width < 768 ? 4 : 3;
    const box = (await page.getByTestId("dump-input-box").boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(restLines * BODY_LINE + FIELD_PADDING * 2 - 1);
    assertCleanConsole(log);
  });
});

test.describe("TE-02 the editor sits inside the band the keyboard leaves", () => {
  test("reduced to a keyboard-height band, the editor is at least 40% of it and entirely inside it", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    // 393 is the phone; 1024 is the iPad, where a hardware-sized keyboard
    // takes the same bite (resolution #66, Josh's iPhone/iPad finding)
    test.skip(width !== 393 && width !== 1024, "the two widths TE-02 names");

    const log = await openDump(page);
    // the band a soft keyboard leaves, driven rather than raised: Playwright
    // cannot open a system keyboard, and this is the viewport that is LEFT
    const band = width === 393 ? { width: 393, height: 500 } : { width: 1024, height: 600 };
    await page.setViewportSize(band);
    await setKeyboardInset(page, 0);

    await page.getByTestId("dump-input").focus();
    const box = page.getByTestId("dump-input-box");
    await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(BODY_LINE * 4);

    const grown = (await box.boundingBox())!;
    expect(grown.height).toBeGreaterThanOrEqual(band.height * 0.4 - 1);
    // ENTIRELY inside it — being the right height for the band is not being
    // in it, which is the whole of Josh's complaint
    expect(grown.y).toBeGreaterThanOrEqual(-1);
    expect(grown.y + grown.height).toBeLessThanOrEqual(band.height + 1);
    assertCleanConsole(log);
  });
});

test.describe("TE-03 the chrome gets out of the editor's way", () => {
  test("the demo watermark is gone while a field is expanded, and back when it is not", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width >= 1180, "the expanded editor is a touch-width behaviour (UX-03)");

    const log = await openDump(page);
    const mark = page.getByTestId("demo-watermark");
    await expect(mark).toBeVisible();

    await page.getByTestId("dump-input").focus();
    await expect(mark).toBeHidden();

    // and it comes back: the flag is cleared by the effect's cleanup, so a
    // blur restores the mark without anybody remembering to
    await page.getByTestId("dump-input").blur();
    await expect(mark).toBeVisible();
    assertCleanConsole(log);
  });
});

test.describe("TE-05 the PC focus ring", () => {
  test("a focused field takes a 2px accent outline at 2px offset, the border unchanged, the caret accent", async ({ page }, testInfo) => {
    const { width, scheme } = pickProject(testInfo.project.name);
    test.skip(width !== 1366, "the width TE-05 names");

    const log = await openDump(page);
    // `find-input` rather than the dump box: the dump field deliberately
    // flattens its own border and padding inside the capture card, so it is
    // the wrong subject for a rule about the box a field draws
    const field = page.getByTestId("find-input");
    const boxOf = () =>
      page.getByTestId("find-input-box").evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset, border: s.borderTopWidth, padding: s.paddingTop };
      });

    const resting = await boxOf();
    await field.focus();
    const focused = await boxOf();

    expect(focused.style).toBe("solid");
    expect(parseFloat(focused.width)).toBeCloseTo(2, 1);
    expect(parseFloat(focused.offset)).toBeCloseTo(2, 1);
    expect(focused.color).toBe(ACCENT_INK[scheme]);
    // the border does not move — a ring that thickened it would shift every
    // neighbouring control by a pixel on focus
    expect(focused.border).toBe(resting.border);
    expect(parseFloat(focused.padding)).toBeGreaterThanOrEqual(10);

    // the browser's own outline is not what is being seen
    const input = await field.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, caret: s.caretColor };
    });
    expect(input.outline).toBe("none");
    expect(input.caret).toBe(ACCENT_INK[scheme]);
    assertCleanConsole(log);
  });
});

test.describe("TE-06 Enter", () => {
  test("Enter sends the dump, Shift+Enter is a newline, and the journal keeps Enter as a newline", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width !== 1366, "desktop only — on touch, return is a newline and the arrow sends (#11)");

    const log = await openDump(page);
    const dump = page.getByTestId("dump-input");

    // Shift+Enter writes a second line rather than sending
    await dump.fill("Ring the school");
    await dump.press("Shift+Enter");
    await dump.pressSequentially("about Term 4");
    expect(await dump.inputValue()).toContain("\n");

    // Enter sends: the draft clears and the capture lands
    await dump.press("Enter");
    await expect.poll(async () => await dump.inputValue()).toBe("");
    await expect(page.getByTestId("latest-in")).toContainText("Ring the school");

    // the journal is prose and keeps Enter as a newline — it has no send
    await gotoTab(page, "today");
    const journal = page.getByTestId("close-journal");
    await journal.fill("Good day");
    await journal.press("Enter");
    await journal.pressSequentially("tired by four");
    expect(await journal.inputValue()).toContain("\n");
    assertCleanConsole(log);
  });
});

test.describe("TE-04 the built mock has no banner on a phone", () => {
  test("the mock chip is not rendered under 768", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width !== 393, "the width TE-04 names");

    // The FILE NAME is derived, never spelled. A-6 renames the mock to v14 at
    // the release, and a test carrying its own copy of the version would go
    // red for a rename that changed nothing — the second copy that drifts
    // (hard rule 16). `MOCK_VERSION` in the build tool is the one declaration.
    const tools = readFileSync(join(__dirname, "..", "..", "tools", "build-mock.mjs"), "utf8");
    const version = /MOCK_VERSION = "(v\d+)"/.exec(tools)?.[1];
    expect(version, "MOCK_VERSION not found in tools/build-mock.mjs").toBeTruthy();
    const html = readFileSync(join(__dirname, "..", "..", "..", `jstack-mock-${version}.html`), "utf8");

    // Served over the suite's own origin rather than file://, so storage and
    // the passkey ceremony behave as they do in a browser. The chip's script
    // runs on DOMContentLoaded and does not wait for the app.
    await page.route("**/__mock__", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("/__mock__");

    await expect(page.locator("#mock-chip")).toBeHidden();
    // and it IS there above the phone edge — a test that passes because the
    // element never existed would pass just as well with the banner deleted
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator("#mock-chip")).toBeVisible();

    // TE-03's other half. The acceptance names the watermark AND the mock
    // banner, and the watermark is asserted in the app above — but the banner
    // exists only in this built file, so without this it would be a claim with
    // no gate (rule 15).
    //
    // The attribute is driven directly rather than by focusing a field: it IS
    // the interface. The app sets `data-editor-expanded` on <body> and this
    // artefact, which knows nothing about React, listens for it. Driving the
    // contract is the test; booting the app to set it would test the app.
    await page.evaluate(() => document.body.setAttribute("data-editor-expanded", "true"));
    await expect(page.locator("#mock-chip")).toBeHidden();
    await page.evaluate(() => document.body.removeAttribute("data-editor-expanded"));
    await expect(page.locator("#mock-chip")).toBeVisible();
  });
});
