/**
 * The live voice session, as app state (V-2, §4.11).
 *
 * `lib/voice.ts` owns the protocol; this owns the ONE session the app may
 * have and everything the UI needs to render it. One, deliberately: two
 * conversations at once is not a feature, and a second `start()` while one
 * runs would leave a socket nobody can see or end.
 *
 * The session is not held in React state. `VoiceSession` is a long-lived
 * object with timers and a socket, and it is subscribed to rather than
 * re-created — the store mirrors what it emits into the fields the screen
 * reads, which is why the screen can unmount (Josh switches tabs) without
 * the conversation noticing.
 */
import { AppState } from "react-native";
import { create } from "zustand";
import { setDocTitle } from "@/lib/docTitle";
import { getVoiceSocket } from "@/data/provider";
import { VoiceSession, type TranscriptRow, type VoiceState } from "@/lib/voice";
import { stopMicFor, type MicHandle } from "@/lib/mic";
import { openTalkMic } from "@/lib/talkMic";
import { mirrorSession, talkSpeakers } from "@/lib/talkSession";
import { holdScreenAwake, releaseScreenAwake } from "@/lib/wakeLock";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

type VoiceStoreState = {
  session: VoiceSession | null;
  state: VoiceState;
  transcript: TranscriptRow[];
  interim: string;
  filed: string[];
  error: string | null;
  muted: boolean;
  /** true from `start()` until the session ends, whatever tab is on screen.
   * `TalkScreen` and `TalkBanner` both read it, and the invariant in
   * `tests/unit/voice-ui.test.ts` is that exactly one of them is showing. */
  running: boolean;
  /** V-1: the microphone this session opened, so `end()` can release it.
   * Discarding it is what left the mic on after every conversation. */
  mic: MicHandle | null;
  /** A4R11-06: a lock took the microphone ("locked"); v2.3.1 WPJ-3: the app left the screen
   * ("away"). The conversation stands and waits for Resume; nothing reopens on its own. */
  paused: "locked" | "away" | null;

  start: () => void;
  end: (reason?: "user" | "confirmed" | "absent") => void;
  say: (text: string) => void;
  reply: () => void;
  audio: (chunk: string) => void;
  toggleMute: () => void;
  resumeAfterLock: () => void;
};

/** "● Talking · JSTACK" while a session runs (V-2), so a person with six tabs
 * open can find the conversation they left running. */
function setTitle(running: boolean): void {
  setDocTitle(running ? "talking" : null);
}

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
  session: null,
  state: "idle",
  transcript: [],
  interim: "",
  filed: [],
  error: null,
  muted: false,
  running: false,
  mic: null,
  paused: null,

  start: () => {
    if (get().running) return;
    watchLock();
    awayWatch?.remove(); // WPJ-3: the device locking or the app switching away pauses Talk as a lock does
    awayWatch = AppState.addEventListener("change", (state) => state === "background" && pause("away"));
    const voice = useSettingsStore.getState().voice;
    const session = new VoiceSession({
      connect: getVoiceSocket,
      cueWord: voice?.cueWord ?? "over",
      endPhrases: voice?.endPhrases,
      // OFF unless a person turned it on, and off in car mode whatever they
      // set (ADR-24): a timer that ends a turn interrupts someone who paused,
      // and in a car they cannot glance at the screen to see what happened.
      silenceTurnMs: voice?.carMode || voice?.silenceTurnSeconds == null ? null : voice.silenceTurnSeconds * 1000,
      // the EA's voice: read aloud unless turned off, and never gated on Mute
      // (R-06, TS-03, VO-A — `lib/talkSession.ts` says why each half is so)
      ...talkSpeakers(voice),
    });
    mirrorSession(session, set, get, () => release());

    set({ session, running: true, error: null, transcript: [], interim: "", filed: [], muted: false, paused: null });
    setTitle(true);
    if (voice?.carMode) holdScreenAwake("car-mode"); // VP-07, on its own tag beside the microphone's (WPJ-1)
    // TS-02: brevity travels with the style, and "brief" is the default rather
    // than a setting somebody has to find. A missing `voice` still starts a
    // session — the brevity the server sees is the same either way.
    session.start({ style: voice?.style ?? "", speed: voice?.speed ?? 1, brevity: voice?.brevity ?? "brief" });
    openMic(session);
  },

  end: (reason = "user") => {
    get().session?.end(reason);
    // MC-07: THE release. The session's stop function was discarded at
    // `start()`, so nothing here could ever have let go of the stream.
    release({ state: "ended", interim: "" });
  },

  say: (text) => {
    const s = get().session;
    if (s == null || text.trim() === "") return;
    s.sendText(text);
    set({ transcript: [...s.transcript] });
  },

  reply: () => get().session?.turn(),

  audio: (chunk) => {
    if (get().muted) return;
    get().session?.pushAudio(chunk);
  },

  /** muting stops the MICROPHONE, not the speaker: it is what you press when
   * someone else walks in, and it must not also make the EA inaudible.
   *
   * D-6 (the A-6 audit): it used to flip this boolean and nothing else, so the
   * DEVICE stayed open and capturing — the chunks were dropped one layer above
   * `pushAudio`, the browser's recording indicator stayed lit, and the comment
   * above claimed a release that never happened. "Mic staying on and I don't
   * know how to turn it off" is the first thing Josh asked this build to make
   * impossible (JOSH_QA item 11), and Mute is the control whose whole purpose
   * is to stop the microphone. It lets go of the device now, the same way
   * `end()` does, and Unmute opens a new one — the permission is already
   * granted, so there is no second prompt.
   *
   * MC-10 was disclosed PARTIAL for exactly this (A4R11-07, carried at the A-4
   * cap under the wider rule); this closes it. */
  toggleMute: () => {
    const muting = !get().muted;
    if (!muting) {
      set({ muted: false });
      const session = get().session;
      if (session != null) openMic(session);
      return;
    }
    get().mic?.stop();
    stopMicFor("talk"); // and one still at the permission prompt
    set({ muted: true, mic: null });
  },

  /** A4R11-06: after a lock, the one way back — a person presses Resume. */
  resumeAfterLock: () => {
    const { session, paused, muted } = get();
    if (session == null || paused == null) return;
    set({ paused: null });
    if (!muted) openMic(session);
  },
}));

/** Start, Unmute and Resume open the conversation's microphone the same way,
 * and keep the handle that `end()` and Mute release. */
function openMic(session: VoiceSession): void {
  const v = useVoiceStore.getState;
  void openTalkMic(session, () => v().muted, (s) => v().session === s).then((h) => h != null && useVoiceStore.setState({ mic: h }));
}

/** MC-07: every exit path releases the microphone — End, an end phrase, a
 * server close, an error — and one still at the permission prompt with it
 * (A4R10-03's class). */
function release(also: Partial<VoiceStoreState> = {}): void {
  useVoiceStore.getState().mic?.stop();
  stopMicFor("talk");
  useVoiceStore.setState({ running: false, session: null, mic: null, paused: null, ...also });
  setTitle(false);
  releaseScreenAwake("car-mode");
}

/**
 * A4R11-06: a lock releases the microphone (`relock`, MC-07) and leaves the
 * conversation standing, so the conversation has to hear of it. Here, not in
 * `stores/session.ts`, which cannot import a store that imports it — and armed
 * by the first `start()`, never at import: this module can be evaluated inside
 * `stores/session.ts`'s own import graph, before the session store exists.
 */
let lockWatch: (() => void) | null = null;
let awayWatch: { remove: () => void } | null = null;
function watchLock(): void {
  lockWatch ??= useSessionStore.subscribe((s, prev) => {
    if (s.locked && !prev.locked) pause("locked");
  });
}
function pause(why: "locked" | "away"): void {
  const talk = useVoiceStore.getState();
  if (!talk.running || (why === "away" && talk.paused != null)) return; // a lock always says so (WPJ-3)
  talk.mic?.stop();
  stopMicFor("talk"); // and one still at the permission prompt
  useVoiceStore.setState({ paused: why, mic: null });
}
