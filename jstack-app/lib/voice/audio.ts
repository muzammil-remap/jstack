/**
 * The two things that only exist in a browser: the real socket, speech
 * synthesis, and microphone capture (V-1).
 *
 * Split out of `lib/voice.ts` at S-1. They are the only parts of the voice
 * stack that touch a browser API, which is exactly why they are worth having
 * on their own: the session is testable without any of them.
 */
import type { ClientMessage, ServerMessage, Socket, VoiceStyle } from "@/lib/voice/protocol";

export function webSocket(url: string): Socket {
  const ws = new WebSocket(url);
  return {
    send: (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => ws.close(),
    onOpen: (cb) => ws.addEventListener("open", () => cb()),
    onMessage: (cb) =>
      ws.addEventListener("message", (e: MessageEvent) => {
        try {
          cb(JSON.parse(String(e.data)) as ServerMessage);
        } catch {
          // a frame this client cannot parse is the server's problem to fix,
          // not a reason to drop a conversation someone is having
        }
      }),
    onClose: (cb) => ws.addEventListener("close", () => cb()),
  };
}

/** `speechSynthesis` for a `speak` with no `audioRef` (§4.11). Returns false
 * where there is no synthesiser, so a caller can say so rather than going
 * quiet — an EA that replies silently looks broken, not thoughtful.
 * `onDone` fires once, when the utterance ends or errors (R-06): it is how
 * the session knows the EA has finished and the microphone may listen again. */
export function browserSpeak(text: string, voice?: VoiceStyle, onDone?: () => void): boolean {
  const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const Utterance = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  if (synth == null || Utterance == null) return false;
  const u = new Utterance(text);
  if (voice) u.rate = voice.speed;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };
  u.onend = done;
  u.onerror = done;
  synth.speak(u);
  return true;
}

/**
 * `captureAudio` used to live here: microphone → 250ms chunks → `pushAudio`.
 *
 * V-1 moved it into `lib/mic.ts`, which is now the only file in the app that
 * may touch `getUserMedia`, `SpeechRecognition` or `MediaRecorder` (ADR-49,
 * hard rule 12c, guarded by MC-01's source scan). Two things were wrong with
 * it here and both are fixed there: the mime type was hard-coded to
 * `audio/webm;codecs=opus`, which Safari does not support and which therefore
 * threw on Josh's iPhone into a `.catch(() => null)`; and the stop function it
 * returned stopped the RECORDER without ever stopping the stream's tracks, so
 * the browser's recording indicator stayed lit. `stores/voice.ts` discarded
 * even that.
 *
 * The base64 note is worth keeping: the chunk is base64 because
 * `ClientMessage` is JSON. A binary frame would be faster and is what a real
 * backend will want, and swapping to one is a change to `lib/mic.ts` and to
 * `webSocket` below, not to the session.
 */

/**
 * TS-03 / VO-A: play the EA's OWN voice for a `speak` that carries an
 * `audioRef`, through an `Audio` element on the web.
 *
 * Returns a promise that settles when the clip ends, errors, or cannot be
 * started — the session awaits it and stays `speaking` until then, which is
 * what keeps the microphone deaf while the EA talks (R-06). `null` where there
 * is no `Audio` constructor at all, so the caller falls back to the
 * synthesiser rather than going silent; on native that is `speechSynthesis`
 * through `browserSpeak`, recorded in BUGLOG_v22.md because a native lane that
 * cannot fetch the ref is a real gap rather than a decision.
 *
 * The ref is resolved against the app's own origin: it is an id the server
 * issued, never a URL from the wire (SEC — a `speak` is data, not a fetch
 * instruction).
 */
export function playAudioRef(ref: string): Promise<void> | null {
  const Ctor = (globalThis as { Audio?: new (src: string) => HTMLAudioElement }).Audio;
  if (Ctor == null) return null;
  const id = encodeURIComponent(ref);
  return new Promise<void>((done) => {
    let finished = false;
    const fin = () => {
      if (finished) return;
      finished = true;
      done();
    };
    try {
      const el = new Ctor(`/voice/${id}`);
      el.onended = fin;
      el.onerror = fin;
      const started = el.play() as unknown as Promise<void> | undefined;
      if (started != null && typeof started.then === "function") started.then(undefined, fin);
    } catch {
      fin();
    }
  });
}
