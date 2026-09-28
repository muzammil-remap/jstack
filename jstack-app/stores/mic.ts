/**
 * mic.ts (V-1, ADR-49) — what the microphone is doing, for everything that
 * has to show it.
 *
 * `lib/mic.ts` owns the device; this owns the one fact the UI renders. They
 * are separate because the device is not React and the indicator is: the
 * field's button, `MicBanner` on every tab, the rail's health line, the
 * document title and Talk's Mute all read this, and MC-01's invariant is that
 * a mic cannot be open with none of them showing.
 *
 * Nothing here opens or closes anything. A component that wants to STOP the
 * mic calls `stopActiveMic()` in `lib/mic.ts`; a store that could also stop it
 * would be a second owner, which is the whole thing ADR-49 exists to prevent.
 */
import { useCallback, useEffect } from "react";
import { setDocTitle } from "@/lib/docTitle";
import { create } from "zustand";
import { startMic, stopActiveMic, stopMicFor, type MicPurpose, type MicState } from "@/lib/mic";
import { currentParameter } from "@/stores/parameters";

/**
 * MC-02 / hard rule 21: ONE label map for the state enum, with a test that
 * every member has an entry. `null` is a deliberate entry, not a gap — those
 * states put no word on the button, and a map that simply omitted them could
 * not tell "no word here" from "somebody forgot".
 */
const STATE_LABEL: Record<MicState, string | null> = {
  off: null,
  // the permission prompt is up: the button already says the mic is coming
  requesting: "Listening",
  listening: "Listening",
  transcribing: "Working…",
  done: null,
  // the honest line goes UNDER the field, not on a 30px button
  error: null,
};

/** the word beside the glyph, or null where the state carries none (MC-02) */
export function micStateLabel(state: MicState): string | null {
  return STATE_LABEL[state];
}

/** MC-03: the banner says what the microphone is FOR, in Josh's words. */
const PURPOSE_TEXT: Record<MicPurpose, string> = {
  brain: "listening for Brain",
  journal: "listening for your journal",
  dictate: "listening for the EA",
  talk: "listening for the EA",
};

type MicStoreState = {
  state: MicState;
  purpose: MicPurpose | null;
  /** the honest line when a session ended in error (MC-08) */
  error: string | null;
  /** why the mic stopped itself, when it did (MC-06) */
  notice: string | null;
  set: (state: MicState, purpose: MicPurpose, detail?: { reason?: string; notice?: string }) => void;
  clear: () => void;
};

/**
 * MC-03: "● Listening · JSTACK" while a microphone is open, so a person with
 * six tabs open can find the one that is listening. The one place the app
 * writes the title for the mic — `stores/voice.ts` writes "● Talking" for a
 * Talk session, which is why `purpose: "talk"` is left alone here rather than
 * having the two of them fight over the same string.
 */
function setTitle(open: boolean, purpose: MicPurpose | null): void {
  if (purpose === "talk") return;
  setDocTitle(open ? "listening" : null);
}

export const useMicStore = create<MicStoreState>((set) => ({
  state: "off",
  purpose: null,
  error: null,
  notice: null,
  set: (state, purpose, detail) => {
    setTitle(micIsOpen({ state }), purpose);
    set({
      state,
      purpose,
      error: state === "error" ? (detail?.reason ?? null) : null,
      // a notice survives the stop that raised it — it is what the person
      // reads to find out why the mic went off while they were thinking
      notice: detail?.notice ?? (state === "listening" ? null : undefined),
    });
  },
  clear: () => {
    setTitle(false, null);
    set({ state: "off", purpose: null, error: null, notice: null });
  },
}));

/** true while a microphone is actually open (MC-01, MC-03) */
export function micIsOpen(s: { state: MicState }): boolean {
  return s.state === "requesting" || s.state === "listening" || s.state === "transcribing";
}

/**
 * C-7b / MC-10 — true while ANY purpose's microphone is open, for a control
 * that is not scoped to one surface's own purpose (the floating orb). Reads
 * the store's raw `state` directly rather than through `useDictation`, whose
 * `mine` filter deliberately zeroes another purpose's state out for a
 * purpose-scoped indicator (line 167 above) — exactly the filtering a
 * global "is a mic live anywhere" check must NOT go through, or a second
 * mic control offers itself, and starting it steals the first one (MC-01's
 * "second start stops the first" applied where nobody asked for it).
 */
export function useAnyMicOpen(): boolean {
  return useMicStore((s) => micIsOpen({ state: s.state }));
}

/**
 * MC-02 / MC-04 — the one way a field starts dictation.
 *
 * Three call sites press a mic button (Brain's dump field, the Today journal,
 * the floating orb) and before V-1 each of them set `session.listening` and
 * hoped something downstream was listening. One hook instead: it reads
 * `mic.autoStopSeconds` (the parameter L-1 declared and nothing read), streams
 * interim text to the caller, and reports the state the button renders.
 *
 * `toggle` rather than `start`: the button that opens the microphone is the
 * button that closes it, which is the first thing Josh asked for.
 */
export function useDictation(opts: {
  purpose: MicPurpose;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  /**
   * MC-07, A4R11-02 (security-class): a dictation session outlives its surface
   * only where its WORDS do. Brain's field and the journal write into a store
   * and MC-03 puts a banner on every tab, so theirs keeps listening across a
   * tab switch. The Dictate dialog's words live in its own component state:
   * once it closes they go nowhere, and a microphone still listening for a
   * surface that is gone is a mic left open — including one closed while the
   * permission prompt was still up, which opened when the prompt was answered.
   */
  releaseOnUnmount?: boolean;
}): {
  state: MicState;
  error: string | null;
  notice: string | null;
  toggle: () => void;
} {
  const state = useMicStore((s) => s.state);
  const purpose = useMicStore((s) => s.purpose);
  const error = useMicStore((s) => s.error);
  const notice = useMicStore((s) => s.notice);
  // another surface's microphone is not this button's state: the Brain field
  // must not render "Listening" because the journal is listening
  const mine = purpose === opts.purpose;

  // the exit path MC-07 names and nothing built (A4R11-02). `stopMicFor`
  // releases a session still at the permission prompt as readily as a
  // listening one, and touches no other purpose's.
  const releases = opts.releaseOnUnmount === true;
  const myPurpose = opts.purpose;
  useEffect(() => {
    if (!releases) return;
    return () => stopMicFor(myPurpose);
  }, [releases, myPurpose]);

  const toggle = useCallback(() => {
    if (mine && micIsOpen({ state })) {
      stopActiveMic();
      return;
    }
    void startMic({
      purpose: opts.purpose,
      autoStopSeconds: Number(currentParameter("mic.autoStopSeconds")),
      onInterim: opts.onInterim,
      onFinal: opts.onFinal,
    });
    // opts is a fresh object each render; the callbacks it carries are read at
    // press time, so the identity of `opts` is deliberately not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, state, opts.purpose]);

  return { state: mine ? state : "off", error: mine ? error : null, notice: mine ? notice : null, toggle };
}

/** MC-03: "Mic on · listening for Brain · Stop" */
export function micBannerText(purpose: MicPurpose | null): string {
  return `Mic on · ${purpose == null ? "listening" : PURPOSE_TEXT[purpose]}`;
}
