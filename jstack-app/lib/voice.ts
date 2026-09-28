/**
 * The live voice stack (V-1, CONTRACT_v21.md §4.11, ADR-24).
 *
 * One class, one socket, and one rule that shapes everything else:
 * **silence never ends anything.** Not a turn, not the session. A person
 * mid-sentence looking for a word, or putting the phone down to find a
 * date, is having a conversation — and a client that hangs up on them is
 * the reason nobody uses voice assistants for anything that matters.
 *
 * So a pause sends `hold` and stops the audio; speech sends `resume`; the
 * server keeps the session, the transcript and the context throughout. A
 * turn ends only when the person says so — the cue word, the Reply tap, or
 * their own optional silence timer, which is off by default in car mode.
 * The server may say `turn?` when it thinks an utterance is finished; the
 * client decides, and this one ignores it.
 *
 * `Socket` is an interface with two implementations: a real `WebSocket`
 * (`webSocket()`) and the scripted mock (`data/mock/voice.ts`). The session
 * cannot tell them apart, which is what makes VP-02/VP-08/VP-09 testable
 * without a server and what will make the swap at go-live a one-line change.
 *
 * S-1 split the 515-line original into four, and this file is the barrel that
 * keeps every importer's line unchanged:
 *
 *   `voice/protocol.ts`  the wire vocabulary and the phrase predicates — types
 *                        and pure functions, importable from anywhere without
 *                        a cycle
 *   `voice/timers.ts`    the five handles the session arms and the reconnect
 *                        ladder. They live together because they FAIL together:
 *                        an end, an error and a drop each clear the same set,
 *                        and a set spread across a class is a set somebody
 *                        forgets one of
 *   `voice/session.ts`   the state machine
 *   `voice/audio.ts`     the parts that only exist in a browser
 *
 * A moved export is not a changed expectation: every voice test passed this
 * refactor untouched, which is the only thing that makes a split like this
 * worth trusting.
 */
export { DEFAULT_END_PHRASES, isYes, matchesPhrase } from "@/lib/voice/protocol";
export type { ClientMessage, ServerMessage, Socket, TranscriptRow, VoiceEvent, VoiceOptions, VoiceSource, VoiceState, VoiceStyle } from "@/lib/voice/protocol";
export { VoiceSession } from "@/lib/voice/session";
// `captureAudio` went to `lib/mic.ts` at V-1 — one owner for the microphone
// (ADR-49, hard rule 12c). The synthesiser and the socket stay: neither opens
// a capture device.
export { browserSpeak, playAudioRef, webSocket } from "@/lib/voice/audio";
