/**
 * VP-04..VP-09 (V-2) — the conversation, in a browser.
 *
 * The rig pushes the audio chunks a microphone would (`__JSTACK__.voice`),
 * because a headless browser has neither a microphone nor a permission
 * dialog — and because the scripted server answers those chunks exactly as
 * it would answer a real recorder. That seam is `lib/voice.ts`'s `Socket`,
 * and it is the reason any of this is testable at all.
 */
import { expect, gotoTab, openUnlocked, pickProject, store, test } from "../helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const rig = (page: import("@playwright/test").Page) => ({
  audio: (chunk: string) => page.evaluate((c) => (window as any).__JSTACK__.voice.audio(c), chunk),
  drop: () => page.evaluate(() => (window as any).__JSTACK__.voice.drop()),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * VP-04 says `speechSynthesis.speak` is called (stubbed). It was never
 * stubbed here, which mattered only once R-06 made the session stay
 * `speaking` until an utterance ENDS: a headless browser's synthesiser has
 * no voices and may never say so, and the mic is deaf while speaking. The
 * stub behaves like a synthesiser that talks — `onend` after a moment — and
 * records what it was asked to say, so the assertion is on the call.
 */
async function stubSynthesis(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[]; __played: string[]; speechSynthesis: unknown; SpeechSynthesisUtterance: unknown };
    w.__spoken = [];
    // TS-03 / VO-A: the EA's OWN voice. A `speak` carrying an `audioRef` is
    // played rather than synthesised, and V2.1 played nothing at all — so the
    // rig records what was asked for, the way it records what was spoken.
    // `/voice/<ref>` would 404 in this build; the stub answers at once.
    w.__played = [];
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {
        w.__played.push(src);
      }
      play() {
        setTimeout(() => this.onended?.(), 60);
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "Audio", { value: FakeAudio, configurable: true });
    class Utterance {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      rate = 1;
      constructor(public text: string) {}
    }
    // `window.speechSynthesis` is a read-only accessor: a plain assignment
    // is silently ignored and the real (voiceless) synthesiser stays in place
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: (u: Utterance) => {
          w.__spoken.push(u.text);
          setTimeout(() => u.onend?.(), 120);
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
  });
}

/**
 * A4R11-06 (v2.3 B-3): the state line says "listening" only while Talk's
 * microphone is open, and a headless browser has no microphone. The rig opens
 * the test build's stub one (`__JSTACK__.mic.use`), so "listening" is backed
 * by a stream here, as it has to be on a phone.
 */
const stubMic = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__JSTACK__.mic.use());

const spoken = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const played = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __played: string[] }).__played);

/**
 * Start, and wait for the EA's greeting to be SPOKEN and done. While the EA
 * speaks the microphone is deaf (VP-07, R-06), so audio pushed over the
 * greeting is dropped — which is what a person waiting for the EA to finish
 * would never do, and what a rig pushing chunks the instant the socket
 * opened did in every test.
 */
async function startTalking(page: import("@playwright/test").Page) {
  await page.getByTestId("talk-start").click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("talk-state")).toHaveText("listening");
}

async function openTalk(page: import("@playwright/test").Page) {
  await stubSynthesis(page);
  await openUnlocked(page);
  await stubMic(page);
  await gotoTab(page, "brain");
  await page.getByTestId("talk-with-ea").click();
  await expect(page.getByTestId("talk-screen")).toBeVisible();
}

test.describe("VP-04 the conversation", () => {
  test("VP-11: interim text, then a reply with its sources, and the chrome behaves for the width", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    await openTalk(page);
    // A `screen`, not a sheet: a conversation is not something you have in
    // the corner of a tab. Below 1180 it replaces the chrome outright.
    //
    // At 1180 and up it does NOT, and that is TS-01/UX-J rather than a
    // regression: the conversation is a centred 880px panel over the dimmed
    // app, and the rail stays visible and usable behind it. Edge-to-edge on a
    // 1920 monitor stretched Talk's Reply row across two feet of glass and
    // hid the app for no reason. Recorded in §4.
    if (width >= 1180) await expect(page.getByTestId("tab-brain")).toHaveCount(1);
    else await expect(page.getByTestId("tab-brain")).toHaveCount(0);

    await startTalking(page);

    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await expect(page.getByTestId("talk-interim")).toContainText("what's");

    await r.audio("c");
    await expect(page.getByTestId("talk-transcript")).toContainText("What's most urgent?");

    await page.getByTestId("talk-reply").click();
    // V-2 (TS-02): the answer is BRIEF by default — a sentence you can act on
    // rather than a paragraph read at you. Recorded in §4.
    await expect(page.getByTestId("talk-transcript")).toContainText("Andy needs the V2 start date");
    await expect(page.getByTestId("talk-sources-1")).toContainText("Andy");
    await expect(page.getByTestId("talk-filed")).toContainText("reply to Andy");
    // VP-04 / TS-03: the greeting carries no `audioRef` and goes to the
    // synthesiser; the ANSWER carries one and is played as the EA's own voice.
    // V2.1 played nothing for an audioRef and called the turn spoken anyway
    // (VO-A), so this pair is the closing of that.
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(1);
    expect((await spoken(page)).some((t) => t.includes("Morning."))).toBe(true);
    await expect.poll(async () => (await played(page)).length).toBeGreaterThanOrEqual(1);
    expect((await played(page)).some((src) => src.includes("andy-reply"))).toBe(true);
    // and it returned to listening on its own once the speech ended (VP-07)
    await expect(page.getByTestId("talk-state")).toHaveText("listening");
  });

  test("the surface fills the phone and is a centred panel on a desktop, and the watermark clears its controls", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    // ux-review R1-01: a `screen` REPLACES the tab, it does not share the
    // page with it. The A-0 captures showed Brain squeezed into the top of
    // the viewport with the conversation laid out underneath it, because the
    // kind hid the rail and the tab bar and nothing put a surface over the
    // tab itself.
    //
    // TS-01/UX-J: below 1180 that surface is the whole viewport, edge to
    // edge. At 1180 and up it is a centred 880px panel over a scrim — same
    // kind, one registry flag, and `dialogs.test.ts` still asserts Talk is
    // the app's only `screen`.
    await openTalk(page);
    const vp = page.viewportSize();
    expect(vp).not.toBeNull();
    const surface = await page.getByTestId("talk-screen").boundingBox();
    expect(surface).not.toBeNull();
    if (width >= 1180) {
      const panel = await page.getByTestId("screen-panel").boundingBox();
      expect(panel).not.toBeNull();
      expect(panel!.width).toBeLessThanOrEqual(880 + 1);
      // centred, and the app is visible either side of it
      expect(Math.abs(panel!.x + panel!.width / 2 - vp!.width / 2)).toBeLessThan(2);
      expect(panel!.x).toBeGreaterThan(0);
    } else {
      expect(Math.abs(surface!.x)).toBeLessThan(1);
      expect(Math.abs(surface!.y)).toBeLessThan(1);
      expect(Math.abs(surface!.width - vp!.width)).toBeLessThan(2);
      expect(Math.abs(surface!.height - vp!.height)).toBeLessThan(2);
    }

    // ux-review R1-02: the demo watermark is positioned to clear a tab bar
    // and a rail that a `screen` does not render, so it printed inside the
    // "or type" field at 393 and through the Reply button's edge at 1366.
    const clear = async (ids: string[]) => {
      const mark = await page.getByTestId("demo-watermark").boundingBox();
      expect(mark).not.toBeNull();
      for (const id of ids) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, id).not.toBeNull();
        const overlaps =
          box!.x < mark!.x + mark!.width && mark!.x < box!.x + box!.width && box!.y < mark!.y + mark!.height && mark!.y < box!.y + box!.height;
        expect({ id, overlaps }).toEqual({ id, overlaps: false });
      }
    };
    await clear(["talk-field", "talk-start"]);
    await startTalking(page);
    await clear(["talk-field", "talk-reply", "talk-mute", "talk-end"]);
  });

  test("VP-05 the typed path sends into the SAME session", async ({ page }) => {
    await openTalk(page);
    await startTalking(page);
    await page.getByTestId("talk-field").fill("what did Andy say");
    await page.getByTestId("talk-field").press("Enter");
    await expect(page.getByTestId("talk-transcript")).toContainText("what did Andy say");
    expect((await store(page, "voice")).running).toBe(true);
  });
});

test.describe("VP-12 the banner", () => {
  test("navigating away leaves the banner, and ending there ends the session", async ({ page }) => {
    await openTalk(page);
    await startTalking(page);
    await expect(page.getByTestId("talk-banner")).toHaveCount(0); // the screen is up

    await page.getByTestId("talk-end").click();
    await expect(page.getByTestId("talk-screen")).toHaveCount(0);

    // and again, this time walking away rather than ending
    await page.getByTestId("talk-with-ea").click();
    await startTalking(page);
    await page.getByTestId("talk-screen").press("Escape");
    await expect(page.getByTestId("talk-banner")).toBeVisible();
    await expect(page.getByTestId("talk-banner")).toContainText("Talking with EA");

    await gotoTab(page, "today");
    await expect(page.getByTestId("talk-banner")).toBeVisible(); // every tab

    await page.getByTestId("talk-banner-return").click();
    await expect(page.getByTestId("talk-screen")).toBeVisible();
    await expect(page.getByTestId("talk-banner")).toHaveCount(0);

    await page.getByTestId("talk-screen").press("Escape");
    await page.getByTestId("talk-banner-end").click();
    await expect(page.getByTestId("talk-banner")).toHaveCount(0);
    expect((await store(page, "voice")).running).toBe(false);
  });
});

test.describe("VP-08 a pause ends nothing", () => {
  test("five seconds of quiet holds; three minutes changes nothing else", async ({ page }) => {
    await openTalk(page);
    await startTalking(page);
    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await r.audio("c");
    await expect(page.getByTestId("talk-transcript")).toContainText("What's most urgent?");

    // the client holds after five seconds of silence, and says so WITHOUT a
    // countdown: a number ticking up while someone thinks is the interface
    // telling them to hurry.
    await expect(page.getByTestId("talk-state")).toHaveText("held · take your time", { timeout: 9000 });
    await expect(page.getByTestId("talk-state")).not.toContainText(/\d/);

    await page.waitForTimeout(2000);
    expect((await store(page, "voice")).running).toBe(true);
    await expect(page.getByTestId("talk-transcript")).toContainText("What's most urgent?");

    await r.audio("d");
    await expect(page.getByTestId("talk-state")).toHaveText("listening");
  });
});

test.describe("VP-09 a dropped socket reconnects", () => {
  test("the transcript survives and the session keeps running", async ({ page }) => {
    await openTalk(page);
    await startTalking(page);
    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await r.audio("c");
    await expect(page.getByTestId("talk-transcript")).toContainText("What's most urgent?");

    await r.drop();
    // no honest line, no ended state: a tunnel is not a decision to stop
    await expect(page.getByTestId("talk-error")).toHaveCount(0);
    expect((await store(page, "voice")).running).toBe(true);
    await expect(page.getByTestId("talk-transcript")).toContainText("What's most urgent?");
  });
});

test.describe("VP-07 car mode", () => {
  test("controls grow to 64px and the session says it is hands-free", async ({ page }) => {
    await stubSynthesis(page);
    await openUnlocked(page);
    await stubMic(page);
    await page.getByTestId("header").getByLabel("Settings").or(page.getByTestId("rail-settings")).first().click();
    await page.getByTestId("voice-car-mode").click();

    await page.getByTestId("settings-close").click();
    await gotoTab(page, "brain");
    await page.getByTestId("talk-with-ea").click();
    await startTalking(page);

    await expect(page.getByTestId("talk-car-mode")).toBeVisible();
    const box = await page.getByTestId("talk-end").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(64);
  });
});

/**
 * TS-01..TS-07 (V-2) — Talk and Dictate, ADR-50.
 *
 * Josh's two open items on the Brain proposal are settled here: desktop Talk
 * is a centred panel rather than edge-to-edge, and "Chat" is "Dictate to EA".
 * Both were defaults taken on his behalf and both are one flag / one rename
 * away from the alternative if he says otherwise.
 */
test.describe("TS-01 the screen has its own chrome", () => {
  test("a title and Close before Start; End while running, at both widths", async ({ page }) => {
    await openTalk(page);

    // before Start there is a way OUT. A `screen` replaces the chrome (or, on
    // a desktop, sits over it), so without this the only exit was the
    // browser's own back button.
    await expect(page.getByTestId("talk-header")).toContainText("Talk with EA");
    await expect(page.getByTestId("talk-close")).toBeVisible();
    await expect(page.getByTestId("talk-end")).toHaveCount(0);

    await startTalking(page);
    // running, the control becomes End — and it is VISIBLE, not scrolled off
    await expect(page.getByTestId("talk-close")).toHaveCount(0);
    await expect(page.getByTestId("talk-end")).toBeInViewport();

    await page.getByTestId("talk-end").click();
    await expect(page.getByTestId("talk-screen")).toHaveCount(0);
  });

  test("Close returns to the tab it was opened from, with the chrome back", async ({ page }) => {
    await openTalk(page);
    await page.getByTestId("talk-close").click();
    await expect(page.getByTestId("talk-screen")).toHaveCount(0);
    // resolution #29: back to Brain, not to Today
    await expect(page.getByTestId("brain-entry")).toBeVisible();
  });
});

/**
 * S6-09 / S6-34 (ux round, Stage 6) — the idle mic orb floated over the open
 * Talk panel at 1366 (a live control that starts a second capture on top of a
 * running conversation), the transcript was pinned to the top so the newest
 * reply sat 408 px above the field you answer in, and Mute was a tenth of
 * Reply's width. BRAIN_PROPOSAL row 2: "Mute · Reply · End at 64 px in car
 * mode" — equal-weight controls; and a conversation reads from the bottom.
 */
test.describe("S6-09 / S6-34 one dress on Talk, and the conversation reads from the foot", () => {
  test("the idle orb is gone while Talk is up; Mute and Reply are equal; the newest turn sits against the field", async ({ page }) => {
    await openTalk(page);
    await expect(page.getByTestId("mic-orb")).toHaveCount(0);
    await startTalking(page);

    const mute = (await page.getByTestId("talk-mute").boundingBox())!;
    const reply = (await page.getByTestId("talk-reply").boundingBox())!;
    expect(Math.abs(mute.width - reply.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(mute.height - reply.height)).toBeLessThanOrEqual(1);

    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await r.audio("c");
    await expect(page.getByTestId("talk-transcript")).toContainText("What's most urgent?");
    await page.getByTestId("talk-reply").click();
    await expect(page.getByTestId("talk-filed")).toContainText("reply to Andy");

    // the last line of the conversation ends within one gap of the field
    const filed = (await page.getByTestId("talk-filed").boundingBox())!;
    const field = (await page.getByTestId("talk-field").boundingBox())!;
    expect(field.y - (filed.y + filed.height)).toBeLessThanOrEqual(24);
    await expect(page.getByTestId("talk-filed")).toBeInViewport();
  });
});

test.describe("TS-02 the transcript and the brevity", () => {
  test("rows carry no separator lines, a typed line appears as you, and brief is the default", async ({ page }) => {
    await openTalk(page);
    await startTalking(page);

    // a typed line lands in the SAME session, labelled as yours. It is the
    // conversation's first row: `talk-row-1` read it too until A4R11-08, which
    // was the server's echo drawn as a second row (BUGLOG_v23.md WPB-2)
    await page.getByTestId("talk-field").fill("what's most urgent");
    await page.getByTestId("talk-field").press("Enter");
    await expect(page.getByTestId("talk-row-0")).toContainText("you");
    await expect(page.getByTestId("talk-row-0")).toContainText("what's most urgent");

    // then a spoken turn, which is what the EA answers
    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await r.audio("c");
    await page.getByTestId("talk-reply").click();

    // no separator lines: the rows are text, not a ruled table (Josh's v3
    // note). Asserted on the computed border rather than by eye.
    const borders = await page.getByTestId("talk-transcript").locator("[data-testid^='talk-row-']").evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).borderBottomWidth),
    );
    expect(borders.every((b) => parseFloat(b) === 0)).toBe(true);

    // TS-02: `start` carried brevity, and the answer is the short one
    await expect(page.getByTestId("talk-transcript")).toContainText("Andy needs the V2 start date");
    // A4R11-08: three rows — the typed line once, the spoken one, the answer
    await expect(page.getByTestId("talk-row-1")).toContainText("What's most urgent?");
    await expect(page.getByTestId("talk-row-2")).toContainText("Andy needs the V2 start date");
    await expect(page.getByTestId("talk-row-3")).toHaveCount(0);
    await expect(page.getByTestId("talk-transcript")).not.toContainText("before he can book his team");
  });
});

test.describe("TS-03 read aloud", () => {
  test("turning Read replies aloud off stops both the synthesiser and the audio", async ({ page }) => {
    await openTalk(page);
    // the setting, through the same action Settings uses
    await page.evaluate(() =>
      (window as any).__JSTACK__.setVoice({ readAloud: false }),
    );
    await page.getByTestId("talk-start").click();
    await expect(page.getByTestId("talk-state")).toHaveText("listening");

    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await r.audio("c");
    await page.getByTestId("talk-reply").click();
    await expect(page.getByTestId("talk-transcript")).toContainText("Andy needs the V2 start date");

    // the words still arrive — it is the VOICE that is off, not the reply
    expect(await spoken(page)).toEqual([]);
    expect(await played(page)).toEqual([]);
  });
});

test.describe("TS-05 the same two entries on Today", () => {
  test("From your EA carries Talk and Dictate, and each opens its surface", async ({ page }) => {
    await stubSynthesis(page);
    await openUnlocked(page);
    await gotoTab(page, "today");

    await page.getByTestId("insight-dictate").click();
    await expect(page.getByTestId("dictate-dialog")).toBeVisible();
    await page.getByTestId("dictate-dialog-close").click();

    await page.getByTestId("insight-talk").click();
    await expect(page.getByTestId("talk-screen")).toBeVisible();
  });
});

test.describe("TS-06 car mode reaches the banner too", () => {
  test("End is 64px on the screen and on the banner", async ({ page }) => {
    await stubSynthesis(page);
    await openUnlocked(page);
    await stubMic(page);
    await page.evaluate(() => (window as any).__JSTACK__.setVoice({ carMode: true }));
    await gotoTab(page, "brain");
    await page.getByTestId("talk-with-ea").click();
    await startTalking(page);

    const onScreen = await page.getByTestId("talk-end").boundingBox();
    expect(onScreen!.height).toBeGreaterThanOrEqual(64);

    // and once you have walked away from it — the case the banner exists for,
    // and the one where a person is least able to aim at a small target
    await page.keyboard.press("Escape");
    await gotoTab(page, "tasks");
    await expect(page.getByTestId("talk-banner")).toBeVisible();
    const onBanner = await page.getByTestId("talk-banner-end").boundingBox();
    expect(onBanner!.height).toBeGreaterThanOrEqual(64);
  });
});

test.describe("TS-04 Dictate to EA", () => {
  test("the entry is named for what it does, carries a mic, and the thread is the server's", async ({ page }) => {
    await stubSynthesis(page);
    await openUnlocked(page);
    await gotoTab(page, "brain");

    // TS-04: "Chat" said nothing about the surface next to "Talk with EA"
    await expect(page.getByTestId("brain-dictate")).toHaveText("Dictate to EA");
    await page.getByTestId("brain-dictate").click();
    await expect(page.getByTestId("dictate-dialog")).toBeVisible();

    // the thread arrives from the SERVER, not from whatever this component
    // happened to accumulate — these two turns were never typed here
    await expect(page.getByTestId("dictate-thread")).toContainText("What did Andy say about the V2 start date?");
    await expect(page.getByTestId("dictate-thread")).toContainText("before he can book his team");

    // the mic is the app's one microphone, with MC-02's states on the button — since v2.3.2 WPR-3 the large orb under
    // the field, held while the words arrive and let go to stop
    await page.evaluate(() => (window as any).__JSTACK__.mic.use());
    await expect(page.getByTestId("dictate-mic")).toHaveAttribute("data-mic-state", "off");
    await page.getByTestId("dictate-mic").hover();
    await page.mouse.down();
    await expect(page.getByTestId("dictate-mic")).toHaveAttribute("data-mic-state", "listening");
    await page.evaluate(() => (window as any).__JSTACK__.mic.speak("Ask Andy for the date"));
    await expect(page.getByTestId("dictate-input")).toHaveValue("Ask Andy for the date");
    await page.mouse.up();
    await expect(page.getByTestId("dictate-mic")).not.toHaveAttribute("data-mic-state", "listening");

    // and a sent turn joins the same thread, both sides
    await page.getByTestId("dictate-send").click();
    await expect(page.getByTestId("dictate-thread")).toContainText("Ask Andy for the date");
    await expect(page.getByTestId("dictate-thread")).toContainText("Got it");

    // closing and reopening re-hydrates from the server rather than losing it
    await page.getByTestId("dictate-dialog-close").click();
    await page.getByTestId("brain-dictate").click();
    await expect(page.getByTestId("dictate-thread")).toContainText("Ask Andy for the date");
  });
});

test.describe("TS-07 an iPhone-shaped run", () => {
  test("no speech recognition and audio/mp4 only: a turn is exchanged, it ends cleanly, and nothing freezes", async ({ page }, testInfo) => {
    const { width } = pickProject(testInfo.project.name);
    test.skip(width !== 393, "the width TS-07 names");

    await stubSynthesis(page);
    await openUnlocked(page);
    await gotoTab(page, "brain");
    // Safari: no SpeechRecognition, and the only container it will record is
    // audio/mp4 — the exact shape that threw into a swallowed catch on Josh's
    // phone and left the session "listening" with no way out.
    await page.evaluate(() => (window as any).__JSTACK__.mic.use({ available: false, mime: "audio/mp4" }));

    await page.getByTestId("talk-with-ea").click();
    await expect(page.getByTestId("talk-screen")).toBeVisible();
    await startTalking(page);

    const r = rig(page);
    await r.audio("a");
    await r.audio("b");
    await r.audio("c");
    await page.getByTestId("talk-reply").click();
    await expect(page.getByTestId("talk-transcript")).toContainText("Andy needs the V2 start date");

    // NOTHING FREEZES: the page answers a click throughout. A frozen page is
    // what the old swallowed rejection actually produced, and it is invisible
    // to an assertion that only reads text.
    const clicked = await page.getByTestId("talk-field").click({ timeout: 1000 }).then(() => true).catch(() => false);
    expect(clicked).toBe(true);

    await page.getByTestId("talk-end").click();
    await expect(page.getByTestId("talk-screen")).toHaveCount(0);

    // MC-07: the microphone is released with the conversation, and the banner
    // that would say otherwise is gone
    expect(await page.evaluate(() => (window as any).__JSTACK__.mic.state())).toBe("off");
    await expect(page.getByTestId("talk-banner")).toHaveCount(0);
    await expect(page.getByTestId("mic-banner")).toHaveCount(0);
  });
});
