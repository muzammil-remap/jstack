/**
 * The microphone half of a Talk conversation, lifted out of `stores/voice.ts`
 * at A-6 when D-6's fix took that store past its 200-line cap (SP-04, and the
 * standing rule: the row that pushes a store over the line SPLITS it rather
 * than trimming it again).
 *
 * It lives in `lib/` and takes what it needs as arguments rather than reaching
 * back into the store, so there is no import cycle: stores read lib, never the
 * other way round.
 *
 * Best effort, and silence is a legitimate answer: a browser with no
 * microphone permission and no supported mime type still has the typed path,
 * which is why `TalkScreen` always shows the field.
 *
 * V-1: this opened its OWN stream and threw away the stop function
 * `captureAudio` returned, so the microphone stayed live after every
 * conversation. It goes through `lib/mic.ts` now, `end()` stops it — and since
 * D-6 so does Mute.
 */
import { micHearsWords, startMic, type MicHandle } from "@/lib/mic";
import type { VoiceSession } from "@/lib/voice";

/** Talk has no silence auto-stop: a pause is the other side thinking, and this
 * session has end phrases and an End button. `lib/mic.ts` reads 0 as "no
 * auto-stop"; dictation passes `mic.autoStopSeconds`. */
const TALK_NO_AUTO_STOP = 0;

/**
 * Opens the microphone for one conversation. Returns the handle to hold, or
 * null when there is nothing to hold — a refused permission, or a session that
 * ended while the prompt was still up.
 *
 * `muted` is read at every chunk rather than captured once: Mute releases the
 * device now, but a chunk already in flight when it does must not be pushed.
 */
export async function openTalkMic(
  session: VoiceSession,
  muted: () => boolean,
  isCurrent: (s: VoiceSession) => boolean,
): Promise<MicHandle | null> {
  const handle = await startMic({
    purpose: "talk",
    autoStopSeconds: TALK_NO_AUTO_STOP,
    // B-4 (v2.3): a phone hears the words on the device, and they join the
    // conversation as the text a typed line sends (§4.11); a browser records
    // the audio for the server. Never both — a session sent audio AND text
    // would hear every sentence twice. While the EA speaks the words are the
    // EA's own, and they are dropped the way its audio is (R-06).
    ...(micHearsWords()
      ? {
          onFinal: (text: string) => {
            if (!muted() && isCurrent(session) && session.state !== "speaking") session.sendText(text);
          },
        }
      : {
          onChunk: (chunk: string) => {
            if (!muted()) session.pushAudio(chunk);
          },
        }),
  });
  if (handle.error != null) {
    // Said, not swallowed — but NOT into `voice.error`, which means "this
    // CONVERSATION failed" and which `TalkScreen` renders as the state line
    // "stopped". `stores/mic.ts` carries the mic's own error and the screen
    // gives it its own line: the socket is up and the field still sends. The
    // first cut put it into voice.error and turned five talk cases red
    // (BUGLOG V-1).
    return null;
  }
  if (!isCurrent(session)) return null; // ended at the prompt: released, not handed on
  return handle;
}
