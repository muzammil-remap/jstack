/**
 * The voice session's state machine (V-1, §4.11, ADR-24).
 *
 * The rule that shapes it: silence never ends anything. A pause sends `hold`
 * and stops the audio; speech sends `resume`; a turn ends only when the person
 * says so. `lib/voice.ts` carries the full account and the map of the split.
 */
import { decideFinal } from "@/lib/voice/protocol";
import type { ServerMessage, Socket, TranscriptRow, VoiceEvent, VoiceOptions, VoiceState, VoiceStyle } from "@/lib/voice/protocol";
import { VoiceTimers } from "@/lib/voice/timers";

function newSessionId(): string {
  return `vs-${Math.random().toString(36).slice(2, 10)}`;
}

export class VoiceSession {
  state: VoiceState = "idle";
  sessionId = newSessionId();
  transcript: TranscriptRow[] = [];

  private socket: Socket | null = null;
  private opts: VoiceOptions;
  private voice: VoiceStyle = { style: "warm", speed: 1 };
  private seq = 0;
  private listeners: ((e: VoiceEvent) => void)[] = [];
  private endingAsked = false;
  private closedByUs = false;
  /** every handle this session arms, and the reconnect ladder (S-1) */
  private timers = new VoiceTimers();
  /** A4R7-15: the transcript row each line `id` landed in, so a line the server
   * sends again replaces its row rather than adding one */
  private rows = new Map<string, number>();
  /** A4R11-08: typed lines the server has not yet said back, by the client's
   * id — the echo is what decides them, and a reconnect sends them again */
  private unheard = new Map<string, string>();
  private typed = 0;

  constructor(opts: VoiceOptions) {
    this.opts = opts;
  }

  on(cb: (e: VoiceEvent) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(e: VoiceEvent): void {
    for (const l of [...this.listeners]) l(e);
  }

  private to(state: VoiceState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ t: "state", state });
  }

  /** `resume: true` is what a reconnect sends, with the SAME sessionId, so
   * the server hands back the transcript rather than starting again (§4.11,
   * VP-09). Nothing else about starting differs. */
  start(voice?: VoiceStyle, resume = false): void {
    if (voice) this.voice = voice;
    this.to("starting");
    this.closedByUs = false;
    const socket = this.opts.connect();
    this.socket = socket;
    socket.onOpen(() => {
      socket.send({ t: "start", sessionId: this.sessionId, voice: this.voice, resume: resume || undefined });
      // A4R11-08: a line typed while the connection was down reached nobody. It
      // goes again under the same id, and the server files it once.
      if (resume) for (const [id, text] of this.unheard) socket.send({ t: "text", text, id });
      this.timers.resetDrops();
      this.to("listening");
      this.armHold();
      this.timers.startPinging(() => this.socket?.send({ t: "ping" }));
    });
    socket.onMessage((m) => this.receive(m));
    socket.onClose(() => this.dropped());
  }

  /** 250ms of audio (§4.11). `seq` only ever increases, across a reconnect
   * too — a server reassembling chunks needs one ordering, not one per
   * socket. Audio is not sent while held: that is what held MEANS. */
  pushAudio(chunk: string): void {
    if (this.state === "held") this.resume();
    if (this.state !== "listening") return;
    this.socket?.send({ t: "audio", seq: this.seq++, chunk });
    this.armHold();
  }

  sendText(text: string): void {
    if (this.state === "ended" || this.state === "error") return;
    if (this.state === "held") this.resume();
    // A4R11-08: keyed by the client's id, so the server's echo replaces this
    // row rather than drawing the line a second time
    const id = `${this.sessionId}-t${++this.typed}`;
    this.rows.set(id, this.transcript.push({ role: "you", text }) - 1);
    this.unheard.set(id, text);
    this.socket?.send({ t: "text", text, id });
    this.armHold();
  }

  hold(): void {
    if (this.state !== "listening") return;
    this.timers.clearHoldKeepingTurn();
    this.socket?.send({ t: "hold" });
    this.to("held");
  }

  resume(): void {
    if (this.state !== "held") return;
    this.socket?.send({ t: "resume" });
    this.to("listening");
    this.armHold();
  }

  /** the ONLY things that end a turn: the cue word, the Reply tap (this,
   * with no intent), or the person's own silence timer. */
  turn(intent?: "end?"): void {
    if (this.state !== "listening" && this.state !== "held") return;
    this.timers.clearHold();
    this.socket?.send({ t: "turn", ...(intent ? { intent } : {}) });
    if (intent === "end?") this.endingAsked = true;
    else this.to("replying");
  }

  /** answers the server's 10-minute "Still here?" without ending the hold. */
  presence(): void {
    this.socket?.send({ t: "presence" });
  }

  end(reason: "user" | "confirmed" | "absent" = "user"): void {
    if (this.state === "ended") return;
    this.closedByUs = true;
    this.timers.clearAll();
    this.socket?.send({ t: "end", reason });
    this.socket?.close();
    this.to("ended");
  }

  /** restarted by every chunk: a person who stops talking has not stopped
   * being in the conversation. */
  private armHold(): void {
    this.timers.armHold(() => this.hold(), () => this.turn(), this.opts.silenceTurnMs);
  }

  /** the end of a spoken reply, however it ended: back to listening with no
   * tap (VP-07), unless something ended or errored the session meanwhile. */
  private spoken(): void {
    this.timers.clearSpeakCap();
    if (this.state !== "speaking") return;
    this.to("listening");
    this.armHold();
  }

  /** A socket that closes on its own is a dropped connection, not an end
   * (§4.11, VP-09): reconnect with the same `sessionId` and `resume: true`.
   * `closedByUs` tells the two apart — without it, ending a session would
   * immediately reopen it. */
  private dropped(): void {
    if (this.closedByUs || this.state === "ended" || this.state === "error") return;
    this.timers.clearActive();
    const wait = this.timers.nextWait();
    if (wait == null) {
      // R-06: five retries did not hold a socket. Say so and stop, rather
      // than trying forever — the typed path and a fresh Start remain.
      this.to("error");
      this.emit({ t: "error", reason: "the connection was lost and could not be restored" });
      return;
    }
    if (wait === 0) {
      this.start(undefined, true);
      return;
    }
    this.timers.scheduleReconnect(wait, () => this.start(undefined, true));
  }

  private receive(m: ServerMessage): void {
    switch (m.t) {
      case "interim":
        this.emit({ t: "interim", text: m.text });
        this.armHold();
        return;
      case "final":
        this.onFinal(m.text, m.id);
        return;
      case "turn?":
        // the server BELIEVES the utterance is done. It does not know whether
        // the person is thinking, and it is not the one being interrupted, so
        // the client decides — and this client waits for the person (ADR-24).
        return;
      case "reply":
        this.transcript.push({ role: "ea", text: m.text, sources: m.sources });
        this.to("replying");
        this.emit({ t: "reply", text: m.text, sources: m.sources });
        return;
      case "speak": {
        this.to("speaking");
        this.timers.clearSpeakCap();
        // VO-A: a `speak` with an `audioRef` used to fall through to
        // `undefined` — no synthesiser, no player, and `spoken()` called at
        // once, so the EA's turn was silent and the session moved on as if it
        // had been heard. The ref is the EA's own voice; the synthesiser is
        // the fallback for a turn that carries none.
        const done = m.audioRef == null ? this.opts.speak?.(m.text) : (this.opts.playAudio?.(m.audioRef) ?? this.opts.speak?.(m.text));
        this.emit({ t: "speak", text: m.text, audioRef: m.audioRef });
        // Back to listening with no tap — hands-free is the whole point in
        // car mode (VP-07) — but only once the speech has ENDED: while the
        // EA speaks the session stays `speaking`, and `pushAudio` drops every
        // chunk, so the microphone cannot hear the EA's own voice (R-06). A
        // speaker that returns nothing is done at once; one that returns a
        // promise is awaited, under a cap for a synthesiser that never says.
        if (done != null && typeof (done as Promise<void>).then === "function") {
          this.timers.armSpeakCap(m.text.length, () => this.spoken());
          const fin = () => this.spoken();
          (done as Promise<void>).then(fin, fin);
        } else {
          this.spoken();
        }
        return;
      }
      case "filed":
        this.emit({ t: "filed", routed: m.routed });
        return;
      case "pong":
        return;
      case "error":
        this.timers.clearAll();
        this.to("error");
        this.emit({ t: "error", reason: m.reason });
        return;
      case "end":
        this.closedByUs = true;
        this.timers.clearAll();
        this.to("ended");
        this.emit({ t: "end", summaryRef: m.summaryRef });
        return;
    }
  }

  private onFinal(text: string, id?: string): void {
    // A4R7-15, A4R11-08: a line this client already holds — a typed line's
    // echo, or a resume handing the transcript back — replaces its row. Its
    // words are decided once, when the server first says the line back: a
    // replayed "yes" must not end the session, nor a replayed cue word a turn.
    const at = id == null ? undefined : this.rows.get(id);
    if (id != null && at != null) {
      this.transcript[at] = { ...this.transcript[at], text };
      this.emit({ t: "final", text });
      if (!this.unheard.delete(id)) return;
    } else {
      this.transcript.push({ role: "you", text });
      if (id != null) this.rows.set(id, this.transcript.length - 1);
      this.emit({ t: "final", text });
    }

    switch (decideFinal(text, this.opts, this.endingAsked)) {
      case "confirm-end":
        this.endingAsked = false;
        this.end("confirmed");
        return;
      case "continue":
        // anything but a yes continues — including twenty seconds of nothing,
        // because nothing is not a no (§4.11)
        this.endingAsked = false;
        return;
      case "offer-end":
        this.turn("end?");
        return;
      case "turn":
        this.turn();
        return;
      case "wait":
        this.armHold();
    }
  }
}
