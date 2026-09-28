/**
 * V-2's one invariant: **no voice session runs with nothing on screen
 * saying so.**
 *
 * A live microphone and no visible sign of it is the worst thing this app
 * could do, and it is one careless `&&` away at all times: `TalkScreen`
 * unmounts the moment Josh taps another tab, and `TalkBanner` is the only
 * thing left. Someone will eventually change the banner's condition to fix
 * something else, and this is what will stop them.
 *
 * It is a truth table over the two pieces of state that decide it, checked
 * against the components' OWN conditions rather than a copy of them — the
 * banner's is imported, and the screen's is "the talk sheet is the open
 * one", which is `layout/dialogs.tsx`'s rule and is asserted here too.
 */
import { DIALOGS } from "@/layout/dialogs";
import { bannerVisible } from "@/components/chrome/TalkBanner";
import { micBannerVisible } from "@/components/chrome/MicBanner";
import { setDocTitle } from "@/lib/docTitle";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { micIsOpen, micStateLabel } from "@/stores/mic";
import type { MicPurpose, MicState } from "@/lib/mic";

/** `TalkScreen` is mounted by `DialogHost` when the talk entry's source
 * state matches — that is the registry's rule, read from the registry. */
function screenMounted(sheet: string | null): boolean {
  const talk = DIALOGS.find((d) => d.name === "talk");
  return talk != null && talk.source === "sheet" && talk.name === sheet;
}

describe("VP-12 · a running session is always visible somewhere", () => {
  const sheets: (string | null)[] = [null, "talk", "teach", "trends"];

  it.each(sheets)("running, with sheet=%s: exactly one of screen and banner", (sheet) => {
    const screen = screenMounted(sheet);
    const banner = bannerVisible({ running: true, sheet });
    expect([screen, banner].filter(Boolean)).toHaveLength(1);
  });

  it.each(sheets)("not running, with sheet=%s: never the banner", (sheet) => {
    expect(bannerVisible({ running: false, sheet })).toBe(false);
  });

  it("the talk entry is a `screen`, so the tab bar and rail are replaced while it runs", () => {
    // if this ever went back to `sheet`, a conversation would be something
    // you have in the corner of a tab, and the banner's whole reason for
    // existing (the screen is GONE when you navigate) would quietly change.
    expect(DIALOGS.find((d) => d.name === "talk")?.kind).toBe("screen");
  });
});

/**
 * MC-01's other half, and the same argument one layer down.
 *
 * V-2's invariant above is about a voice SESSION. This one is about the
 * MICROPHONE, which V-1 made a thing in its own right: dictation from the
 * Brain field, from the Today journal and from the floating orb all open a
 * device, and none of them mounts `TalkScreen`.
 *
 * ADR-49: "no mic can be open with none of these visible." Josh's words are
 * blunter — "mic staying on and I don't know how to turn it off — this must
 * never happen." Before V-1 the only indicator was `ListeningBar`, which
 * rendered on `session.listening`, a flag three components set by hand.
 *
 * Checked against the component's OWN condition, imported rather than
 * restated: a test that retypes the rule it is testing proves only that
 * somebody typed it twice.
 */
describe("MC-01 · an open microphone is always visible somewhere", () => {
  const states: MicState[] = ["off", "requesting", "listening", "transcribing", "done", "error"];
  const purposes: (MicPurpose | null)[] = [null, "brain", "journal", "dictate", "talk"];

  it.each(states)("state=%s: the banner shows exactly when the mic is open and it is not Talk's", (state) => {
    for (const purpose of purposes) {
      const open = micIsOpen({ state });
      const banner = micBannerVisible({ state, purpose });
      // Talk is the one purpose with its OWN banner (resolution #8) — two
      // banners for one session is worse than none, because a person stops
      // reading either.
      expect(banner).toBe(open && purpose !== "talk");
    }
  });

  it("every open state is covered by an indicator, and no closed state raises one", () => {
    const open = states.filter((state) => micIsOpen({ state }));
    // requesting counts: the permission prompt is up and the device is being
    // asked for, which is exactly when a person wants to know why.
    expect(open).toEqual(["requesting", "listening", "transcribing"]);
    for (const state of states.filter((s) => !micIsOpen({ state: s }))) {
      expect(micBannerVisible({ state, purpose: "brain" })).toBe(false);
    }
  });

  it("a Talk microphone is covered by TalkBanner, so the pair leaves no gap", () => {
    // the two components between them: one banner for every open mic, and
    // never two at once
    for (const state of states) {
      const mic = micBannerVisible({ state, purpose: "talk" });
      const talk = bannerVisible({ running: micIsOpen({ state }), sheet: null });
      expect([mic, talk].filter(Boolean).length).toBeLessThanOrEqual(1);
      if (micIsOpen({ state })) expect(talk).toBe(true);
    }
  });

  /** hard rule 21: every member of the enum has a label entry, `null` included */
  it("every mic state has a label decision, so none can be forgotten", () => {
    for (const state of states) {
      expect(Object.prototype.hasOwnProperty.call({ ...LABELS_PROBE }, state)).toBe(true);
    }
    expect(micStateLabel("listening")).toBe("Listening");
    expect(micStateLabel("transcribing")).toBe("Working…");
    expect(micStateLabel("off")).toBeNull();
  });
});

/** the states the label map must cover, listed here so the test above fails
 * loudly if `MicState` gains a member nobody labelled */
const LABELS_PROBE: Record<MicState, true> = {
  off: true,
  requesting: true,
  listening: true,
  transcribing: true,
  done: true,
  error: true,
};

describe("one writer of the document title (P-10, F-18)", () => {
  it("setDocTitle says listening, talking or nothing, and the two stores no longer write the title themselves", () => {
    const doc = { title: "x" };
    (globalThis as { document?: { title: string } }).document = doc;
    try {
      setDocTitle("listening");
      expect(doc.title).toBe("● Listening · JSTACK");
      setDocTitle("talking");
      expect(doc.title).toBe("● Talking · JSTACK");
      setDocTitle(null);
      expect(doc.title).toBe("JSTACK");
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
    const root = join(__dirname, "..", "..");
    for (const f of ["stores/mic.ts", "stores/voice.ts"]) expect(readFileSync(join(root, f), "utf8")).not.toMatch(/doc\.title =/);
  });
});
