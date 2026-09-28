/**
 * The session half of a Talk conversation — the EA's voice, and what the store
 * mirrors from the session's events. Lifted out of `stores/voice.ts` at v2.3
 * B-3, when the lock's pause took that store past its 200-line cap (SP-04, and
 * the standing rule: the row that pushes a store over the line SPLITS it rather
 * than trimming it again). `lib/talkMic.ts` is the microphone half.
 *
 * It takes the store's `set` and `get` rather than importing the store, for
 * `lib/talkMic.ts`'s reason: stores read lib, never the other way round.
 */
import { browserSpeak, playAudioRef, type TranscriptRow, type VoiceOptions, type VoiceSession, type VoiceState } from "@/lib/voice";
import type { VoiceSettings } from "@/data/types";

/**
 * The two speakers a session is handed. It never learns which one runs: the
 * synthesiser for a `speak` with no `audioRef`, the EA's own voice for one that
 * carries it (§4.11).
 */
export function talkSpeakers(voice: VoiceSettings | null): Pick<VoiceOptions, "speak" | "playAudio"> {
  const readAloud = voice?.readAloud;
  return {
    // R-06: NOT gated on `muted` — muting is the microphone, and the EA
    // stays audible (`toggleMute` in `stores/voice.ts`). Resolves when the
    // utterance ends, so the session stays `speaking`, and the mic deaf,
    // until then.
    //
    // TS-03 / resolution #10: `readAloud` defaults TRUE everywhere, not only
    // in car mode (Josh: "assume most interaction will be audio"). Turned
    // off, the EA still replies — in text, on the screen — and the session
    // moves on at once rather than waiting for silence.
    speak: (text) =>
      new Promise<void>((done) => {
        if (readAloud === false || !browserSpeak(text, voice ?? undefined, done)) done();
      }),
    // VO-A: the EA's own voice, when the turn carries one. `null` where
    // there is no Audio constructor, and the session then falls back to the
    // synthesiser rather than going silent.
    playAudio: (ref) => (readAloud === false ? undefined : playAudioRef(ref)),
  };
}

type Mirrored = { state: VoiceState; transcript: TranscriptRow[]; interim: string; filed: string[]; error: string | null };

/**
 * What the screen reads, kept in step with what the session emits. `ended` is
 * the store's release: an end phrase, a server close and an error are exit
 * paths too, and every exit path releases the microphone (MC-07).
 */
export function mirrorSession(session: VoiceSession, set: (patch: Partial<Mirrored>) => void, get: () => Mirrored, ended: () => void): void {
  session.on((e) => {
    switch (e.t) {
      case "state":
        set({ state: e.state, transcript: [...session.transcript] });
        if (e.state === "ended" || e.state === "error") ended();
        return;
      case "interim":
        set({ interim: e.text });
        return;
      case "final":
        set({ interim: "", transcript: [...session.transcript] });
        return;
      case "reply":
        set({ transcript: [...session.transcript] });
        return;
      case "filed":
        set({ filed: [...get().filed, ...e.routed] });
        return;
      case "error":
        set({ error: e.reason });
        return;
      default:
        return;
    }
  });
}
