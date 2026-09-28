/**
 * The voice wire vocabulary (V-1, CONTRACT_v21.md §4.11, ADR-24).
 *
 * Types and pure predicates only — nothing here holds a socket, a timer or a
 * state machine, which is what makes it importable from the mock, the store
 * and the session without a cycle.
 */

/**
 * TS-02: `brevity` travels with the style because it is the same kind of fact
 * — how the EA should sound. "brief" is the DEFAULT (Josh: he will use this a
 * lot, and tokens and time matter), and Settings › Voice flips it.
 */
export type VoiceStyle = { style: string; speed: number; brevity?: "brief" | "full" };
export type VoiceSource = { label: string; ref: string };

/** client → server (§3). VP-01 checks this union against the contract. */
export type ClientMessage =
  | { t: "start"; sessionId: string; voice: VoiceStyle; resume?: boolean }
  | { t: "audio"; seq: number; chunk: string }
  /** A4R11-08: `id` is the client's name for a typed line; the server's `final`
   * for it carries the same id, so the echo replaces the row the client drew */
  | { t: "text"; text: string; id?: string }
  | { t: "hold" }
  | { t: "resume" }
  | { t: "turn"; intent?: "end?" }
  | { t: "presence" }
  | { t: "ping" }
  | { t: "end"; reason: "user" | "confirmed" | "absent" };

/** server → client (§3). */
export type ServerMessage =
  | { t: "interim"; text: string }
  /**
   * A4R7-15: `id` names the line within its session. A resume hands the
   * transcript back as the finals already sent, under the ids they first
   * carried, and a client that already holds a line keeps one row of it and
   * does not act on its words a second time.
   */
  | { t: "final"; text: string; id?: string }
  | { t: "turn?" }
  | { t: "reply"; text: string; sources: VoiceSource[] }
  | { t: "speak"; text: string; audioRef?: string }
  | { t: "filed"; routed: string[] }
  | { t: "pong" }
  | { t: "error"; reason: string }
  | { t: "end"; summaryRef: string };

/**
 * `held` is a state, not an absence of one: the session is alive, the
 * transcript stands, and nothing is being sent. `replying` and `speaking`
 * are separate because a `reply` with no following `speak` is text only
 * (§4.11), and the UI says different things about each.
 */
export type VoiceState = "idle" | "starting" | "listening" | "held" | "replying" | "speaking" | "ended" | "error";

export type TranscriptRow = { role: "you" | "ea"; text: string; sources?: VoiceSource[] };

export interface Socket {
  send(msg: ClientMessage): void;
  close(): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (m: ServerMessage) => void): void;
  onClose(cb: () => void): void;
}

export type VoiceEvent =
  | { t: "state"; state: VoiceState }
  | { t: "interim"; text: string }
  | { t: "final"; text: string }
  | { t: "reply"; text: string; sources: VoiceSource[] }
  | { t: "speak"; text: string; audioRef?: string }
  | { t: "filed"; routed: string[] }
  | { t: "error"; reason: string }
  | { t: "end"; summaryRef: string };

export type VoiceOptions = {
  connect: () => Socket;
  /** the cue word that ends a turn, and the phrases that offer to end the
   * session. Both editable in Settings › Voice (VP-14), so both arrive as
   * data rather than living here as literals. */
  cueWord?: string;
  endPhrases?: string[];
  /** off by default, and off by default in car mode too (ADR-24): a timer
   * that ends a turn is a timer that interrupts a person who paused. */
  silenceTurnMs?: number | null;
  /** speaks a `speak` that carries no `audioRef` (§4.11). Injected so the
   * tests do not need a browser and the native lane does not need a stub.
   * A speaker that returns a promise holds the session in `speaking` until
   * it settles — and while speaking the microphone is deaf (VP-07: the EA
   * must not hear itself). A speaker that returns anything else is done at
   * once. */
  speak?: (text: string) => unknown;
  /**
   * TS-03 / VO-A: plays a `speak` that DOES carry an `audioRef` — the EA's own
   * voice rather than the browser's synthesiser. Injected for the same reason
   * `speak` is, and awaited the same way, so the session stays `speaking` (and
   * the microphone deaf) until the audio ends.
   *
   * V2.1 shipped an `audioRef` branch that played nothing: the session skipped
   * `speak` when a ref was present and had nothing to call instead, so a turn
   * carrying one was silent. No fixture ever sent one, so no test could see it.
   */
  playAudio?: (ref: string) => unknown;
};

/** ADR-24's default list; Settings › Voice edits it (VP-14). */
export const DEFAULT_END_PHRASES = ["that's all", "thanks, that's it", "goodbye", "we're done"];

const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** whole-phrase match: the transcript IS the phrase, or ends with it after a
 * word boundary. Substring matching would end conversations mid-sentence. */
export function matchesPhrase(text: string, phrases: string[]): boolean {
  const t = strip(text);
  return phrases.some((p) => {
    const q = strip(p);
    return q !== "" && (t === q || t.endsWith(` ${q}`));
  });
}

const YES = ["yes", "yep", "yeah", "yes please", "go ahead", "correct"];
export function isYes(text: string): boolean {
  return matchesPhrase(text, YES);
}

/**
 * What a FINAL transcript means (V-1, §4.11).
 *
 * A final transcript is the person's own words, so it is the only place an end
 * phrase or the cue word may be matched — and as a WHOLE phrase, never a
 * substring: "I'm going to head off in a minute" is not "head off". Pure, and
 * beside the predicates it is made of, so the rule can be read in one place
 * rather than inferred from four returns inside a state machine.
 */
/** not exported: `decideFinal`'s return type is its whole interface, and CT-06
 * refuses an export nothing imports. */
type FinalDecision = "confirm-end" | "continue" | "offer-end" | "turn" | "wait";

export function decideFinal(text: string, opts: Pick<VoiceOptions, "endPhrases" | "cueWord">, endingAsked: boolean): FinalDecision {
  if (endingAsked) return isYes(text) ? "confirm-end" : "continue";
  if (matchesPhrase(text, opts.endPhrases ?? DEFAULT_END_PHRASES)) return "offer-end";
  if (opts.cueWord != null && matchesPhrase(text, [opts.cueWord])) return "turn";
  return "wait";
}
