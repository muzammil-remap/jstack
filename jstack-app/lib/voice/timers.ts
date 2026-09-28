/**
 * The session's timers, and the reconnect ladder (V-1, R-06).
 *
 * Split out of `VoiceSession` at S-1: the class was 294 lines, and more than
 * fifty of them were arming and clearing five handles. They live together here
 * because they fail together — an `end`, an `error` and a drop each have to
 * clear the same set, and a set spread across a class is a set somebody
 * forgets one of.
 *
 * Every handle is `unref`'d: a timer that holds a Node process open turns a
 * passing test suite into one that never exits (B-17).
 */

const HOLD_AFTER_MS = 5_000;
const PING_EVERY_MS = 20_000;
/** R-06: a synthesiser that never reports `end` (Chrome does this on long
 * utterances) must not leave the microphone dead. Speech is capped at a
 * generous reading pace, and never past half a minute. */
const SPEAK_CAP_MS = (chars: number) => Math.min(30_000, 1_000 + 60 * chars);
/** R-06: reconnect delays after a drop — the first retry is immediate (a
 * blip), then 1, 2, 4, 8 seconds; a sixth drop is the end of the session. A
 * loop with no ceiling is a phone opening sockets to a dead server all night. */
const RECONNECT_WAITS_MS = [0, 1_000, 2_000, 4_000, 8_000];

/** a handle that must never hold a Node process open (B-17). */
const unref = <T>(id: T): T => {
  (id as unknown as { unref?: () => void }).unref?.();
  return id;
};

export class VoiceTimers {
  private hold: ReturnType<typeof setTimeout> | null = null;
  private turn: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private speakCap: ReturnType<typeof setTimeout> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  /** how many drops this session has seen; indexes RECONNECT_WAITS_MS */
  private drops = 0;

  /** a socket that opened is a conversation, not a retry */
  resetDrops(): void {
    this.drops = 0;
  }

  /** the five-second pause that sends `hold`, restarted by every chunk. A
   * person who stops talking has not stopped being in the conversation. */
  armHold(onHold: () => void, onTurn: () => void, silenceTurnMs?: number | null): void {
    this.clearHold();
    this.hold = unref(setTimeout(onHold, HOLD_AFTER_MS));
    if (silenceTurnMs != null) this.turn = unref(setTimeout(onTurn, silenceTurnMs));
  }

  clearHold(): void {
    if (this.hold) clearTimeout(this.hold);
    if (this.turn) clearTimeout(this.turn);
    this.hold = null;
    this.turn = null;
  }

  /**
   * Only the hold timer, deliberately.
   *
   * A person who set their own silence timer set it to end the TURN, and a
   * hold is not an end — clearing both when the session holds meant the one
   * setting ADR-24 lets a person choose quietly did nothing at all. Kept as
   * its own method rather than a flag on `clearHold`, so the distinction has
   * a name.
   */
  clearHoldKeepingTurn(): void {
    if (this.hold) clearTimeout(this.hold);
    this.hold = null;
  }

  startPinging(ping: () => void): void {
    this.stopPinging();
    this.pinger = unref(setInterval(ping, PING_EVERY_MS));
  }

  stopPinging(): void {
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
  }

  /** the cap on a synthesiser that never reports `end` (R-06) */
  armSpeakCap(chars: number, onCap: () => void): void {
    this.clearSpeakCap();
    this.speakCap = unref(setTimeout(onCap, SPEAK_CAP_MS(chars)));
  }

  clearSpeakCap(): void {
    if (this.speakCap) clearTimeout(this.speakCap);
    this.speakCap = null;
  }

  clearReconnect(): void {
    if (this.reconnect) clearTimeout(this.reconnect);
    this.reconnect = null;
  }

  /**
   * The next reconnect delay, or `null` when the ladder is exhausted.
   *
   * Consumes an attempt, so five drops give five waits and the sixth gives
   * null. A loop with no ceiling is a phone opening sockets to a dead server
   * all night (R-06).
   */
  nextWait(): number | null {
    const wait = RECONNECT_WAITS_MS[this.drops];
    this.drops += 1;
    return wait ?? null;
  }

  scheduleReconnect(wait: number, go: () => void): void {
    this.reconnect = unref(
      setTimeout(() => {
        this.reconnect = null;
        go();
      }, wait),
    );
  }

  /**
   * The three that an end, an error and a drop ALL have to clear: the pinger,
   * the hold and the speak cap. Named once because they fail together — four
   * call sites each listing three clears is four chances to forget one, and
   * forgetting the speak cap leaves a microphone dead (R-06).
   */
  clearActive(): void {
    this.stopPinging();
    this.clearHold();
    this.clearSpeakCap();
  }

  /** those three, plus any pending reconnect: the session is over. */
  clearAll(): void {
    this.clearActive();
    this.clearReconnect();
  }
}
