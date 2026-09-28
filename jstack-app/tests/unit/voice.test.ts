/**
 * VP-01, VP-02, VP-08, VP-09 (V-1) — the voice client's state machine,
 * against a fake socket.
 *
 * The rule every one of these is really testing is ADR-24's: **silence
 * never ends anything.** A client that hangs up on a person who paused to
 * think is the reason voice assistants are not used for anything that
 * matters, and it is the kind of behaviour that only shows up in a real
 * conversation — so it is pinned here, where a three-minute pause costs a
 * millisecond.
 */
import { DEFAULT_END_PHRASES, VoiceSession, browserSpeak, isYes, matchesPhrase, webSocket, type ClientMessage, type ServerMessage, type Socket, type VoiceOptions, type TranscriptRow, type VoiceEvent, type VoiceSource, type VoiceState, type VoiceStyle } from "@/lib/voice";
import { __dropVoiceSocketForTests, mockVoiceSocket } from "@/data/mock/voice";
import { get, reset } from "@/data/mock/db";

/** the fake: it records what the client SENT and lets a test push whatever
 * the server would have replied. No timers of its own — the session's are
 * the thing under test. */
function fakeSocket() {
  const sent: ClientMessage[] = [];
  let onMessage: (m: ServerMessage) => void = () => {};
  let onClose: () => void = () => {};
  let onOpen: () => void = () => {};
  let closed = false;
  const socket: Socket = {
    send: (m) => sent.push(m),
    close: () => {
      closed = true;
    },
    onOpen: (cb) => (onOpen = cb),
    onMessage: (cb) => (onMessage = cb),
    onClose: (cb) => (onClose = cb),
  };
  return {
    socket,
    sent,
    open: () => onOpen(),
    reply: (m: ServerMessage) => onMessage(m),
    drop: () => onClose(),
    get closed() {
      return closed;
    },
  };
}

function session(over: Partial<VoiceOptions> = {}) {
  const fake = fakeSocket();
  const spoken: string[] = [];
  const s = new VoiceSession({ connect: () => fake.socket, speak: (t) => spoken.push(t), ...over });
  return { s, fake, spoken };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("VP-02 · the state machine", () => {
  it("idle → starting → listening, and `start` carries the session id and voice", () => {
    const { s, fake } = session();
    expect(s.state).toBe("idle");
    s.start({ style: "warm", speed: 1 });
    expect(s.state).toBe("starting");
    fake.open();
    expect(s.state).toBe("listening");
    expect(fake.sent[0]).toEqual({ t: "start", sessionId: s.sessionId, voice: { style: "warm", speed: 1 } });
  });

  it("audio chunks carry an increasing seq, and none is sent while held", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    s.pushAudio("a");
    s.pushAudio("b");
    const seqs = fake.sent.filter((m) => m.t === "audio").map((m) => (m as { seq: number }).seq);
    expect(seqs).toEqual([0, 1]);

    s.hold();
    expect(s.state).toBe("held");
    // the next chunk resumes first and is then sent — held means no audio
    // flows, not that speech is thrown away
    s.pushAudio("c");
    expect(fake.sent.some((m) => m.t === "resume")).toBe(true);
    expect(fake.sent.filter((m) => m.t === "audio")).toHaveLength(3);
  });

  it("a reply is text; a speak is spoken and returns to listening with no tap", () => {
    const { s, fake, spoken } = session();
    const seen: VoiceState[] = [];
    s.on((e) => e.t === "state" && seen.push(e.state));
    s.start();
    fake.open();
    const sources: VoiceSource[] = [{ label: "Andy", ref: "email:1" }];
    fake.reply({ t: "reply", text: "Andy's is the one with a deadline", sources });
    expect(s.state).toBe("replying");
    expect(s.transcript.at(-1)).toMatchObject({ role: "ea", text: "Andy's is the one with a deadline" });

    fake.reply({ t: "speak", text: "Andy's is the one with a deadline" });
    expect(spoken).toEqual(["Andy's is the one with a deadline"]);
    expect(s.state).toBe("listening"); // VP-07: hands-free, no tap between turns
    // the whole path, in order, because a UI that only sees the last state
    // cannot tell "spoke, then listening" from "never spoke"
    expect(seen).toEqual(["starting", "listening", "replying", "speaking", "listening"]);
  });

  /**
   * VO-A, closed at V-2. This case used to assert that a `speak` carrying an
   * `audioRef` was NOT spoken locally — "the server sent audio" — and it was
   * true and useless: nothing played the audio either. The session skipped the
   * synthesiser, had no player to call instead, and marked the turn spoken at
   * once, so the EA's reply was silent and the conversation moved on as if it
   * had been heard. No fixture ever sent an `audioRef`, so no test could see
   * it (the mock now sends one — `data/mock/voice.ts`).
   *
   * The claim that survives is the one worth keeping: the local SYNTHESISER is
   * not used when the server sent audio. What changes is that the audio is
   * actually played, and the session waits for it — which is what keeps the
   * microphone deaf while the EA talks (R-06).
   * Recorded in `02_ACCEPTANCE_TESTS_v22.md` §4.
   */
  it("a speak WITH an audioRef plays that audio, and is not spoken by the synthesiser", async () => {
    const played: string[] = [];
    const { s, fake, spoken } = session({ playAudio: (ref: string) => {
      played.push(ref);
      return Promise.resolve();
    } });
    s.start();
    fake.open();
    fake.reply({ t: "speak", text: "hello", audioRef: "blob:1" });
    // the synthesiser stays out of it — that half of the old claim stands
    expect(spoken).toEqual([]);
    // and the audio is actually played, which is the half that did not
    expect(played).toEqual(["blob:1"]);
  });

  it("a speak with an audioRef and NO player falls back to the synthesiser rather than going silent", () => {
    const { s, fake, spoken } = session();
    s.start();
    fake.open();
    fake.reply({ t: "speak", text: "hello", audioRef: "blob:1" });
    expect(spoken).toEqual(["hello"]);
  });

  it("VP-06: an error ends the session honestly and stops the timers", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    const seen: string[] = [];
    s.on((e) => e.t === "error" && seen.push(e.reason));
    fake.reply({ t: "error", reason: "the voice service is unavailable" });
    expect(s.state).toBe("error");
    expect(seen).toEqual(["the voice service is unavailable"]);

    const before = fake.sent.length;
    jest.advanceTimersByTime(120_000);
    expect(fake.sent.length).toBe(before); // no pings from a dead session
  });

  it("`end` closes the socket and says why", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    s.end("user");
    expect(fake.sent.at(-1)).toEqual({ t: "end", reason: "user" });
    expect(fake.closed).toBe(true);
    expect(s.state).toBe("ended");
  });
});

describe("VP-08 · silence never ends anything", () => {
  it("five seconds of quiet sends `hold`, and three minutes of it changes nothing else", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    s.pushAudio("a");
    fake.reply({ t: "final", text: "what's most urgent" });

    jest.advanceTimersByTime(5_000);
    expect(fake.sent.filter((m) => m.t === "hold")).toHaveLength(1);
    expect(s.state).toBe("held");

    // three more minutes. The session is alive, the transcript stands, and
    // NOTHING has been said on the person's behalf.
    jest.advanceTimersByTime(180_000);
    expect(s.state).toBe("held");
    expect(s.transcript).toHaveLength(1);
    expect(fake.sent.some((m) => m.t === "turn")).toBe(false);
    expect(fake.sent.some((m) => m.t === "end")).toBe(false);

    s.pushAudio("b");
    expect(s.state).toBe("listening");
    expect(fake.sent.filter((m) => m.t === "resume")).toHaveLength(1);
  });

  it("VP-10: the server's `turn?` is ignored — the client decides when a turn ends", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    fake.reply({ t: "turn?" });
    expect(fake.sent.some((m) => m.t === "turn")).toBe(false);
    expect(s.state).toBe("listening");
  });

  it("the cue word ends the turn; the Reply tap does the same thing", () => {
    const { s, fake } = session({ cueWord: "over" });
    s.start();
    fake.open();
    fake.reply({ t: "final", text: "so book the flights, over" });
    expect(fake.sent.filter((m) => m.t === "turn")).toHaveLength(1);

    const tapped = session();
    tapped.s.start();
    tapped.fake.open();
    tapped.s.turn();
    expect(tapped.fake.sent.at(-1)).toEqual({ t: "turn" });
    expect(tapped.s.state).toBe("replying");
  });

  it("the optional silence timer is OFF unless a person turns it on", () => {
    const off = session();
    off.s.start();
    off.fake.open();
    off.s.pushAudio("a");
    jest.advanceTimersByTime(60_000);
    expect(off.fake.sent.some((m) => m.t === "turn")).toBe(false);

    // and when it IS on it survives the hold that fires before it: a hold is
    // not an end, so clearing the turn timer at five seconds would have made
    // the one setting a person can quietly choose do nothing at all.
    const on = session({ silenceTurnMs: 8_000 });
    on.s.start();
    on.fake.open();
    on.s.pushAudio("a");
    jest.advanceTimersByTime(5_000);
    expect(on.s.state).toBe("held");
    jest.advanceTimersByTime(3_000);
    expect(on.fake.sent.some((m) => m.t === "turn")).toBe(true);
  });

  it("VP-13: an end phrase ASKS; it never ends on its own", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    fake.reply({ t: "final", text: "thanks, that's it" });
    expect(fake.sent.at(-1)).toEqual({ t: "turn", intent: "end?" });
    expect(s.state).not.toBe("ended");

    // anything but yes continues — including a change of subject
    fake.reply({ t: "final", text: "actually one more thing" });
    expect(s.state).not.toBe("ended");
    expect(fake.sent.some((m) => m.t === "end")).toBe(false);

    fake.reply({ t: "final", text: "thanks, that's it" });
    fake.reply({ t: "final", text: "yes" });
    expect(fake.sent.at(-1)).toEqual({ t: "end", reason: "confirmed" });
  });

  it("VP-13: an end phrase inside a sentence is not an end phrase", () => {
    expect(matchesPhrase("that's all", DEFAULT_END_PHRASES)).toBe(true);
    expect(matchesPhrase("Tell Andy that's all we can do", DEFAULT_END_PHRASES)).toBe(false);
    expect(matchesPhrase("Goodbye.", DEFAULT_END_PHRASES)).toBe(true);
    expect(isYes("yeah")).toBe(true);
    expect(isYes("yes but not that one")).toBe(false);
  });
});

describe("VP-09 · a dropped socket reconnects", () => {
  it("reconnects with the same sessionId and `resume: true`, and duplicates no turn", () => {
    const fakes: ReturnType<typeof fakeSocket>[] = [];
    const s = new VoiceSession({
      connect: () => {
        const f = fakeSocket();
        fakes.push(f);
        return f.socket;
      },
    });
    s.start({ style: "warm", speed: 1 });
    fakes[0].open();
    const id = s.sessionId;
    s.pushAudio("a");
    fakes[0].reply({ t: "final", text: "what's most urgent" });

    fakes[0].drop();
    expect(fakes).toHaveLength(2);
    fakes[1].open();
    expect(fakes[1].sent[0]).toEqual({ t: "start", sessionId: id, voice: { style: "warm", speed: 1 }, resume: true });
    expect(fakes[1].sent.some((m) => m.t === "turn")).toBe(false);

    // seq keeps counting across the reconnect: a server reassembling chunks
    // needs ONE ordering, not one per socket
    s.pushAudio("b");
    expect((fakes[1].sent.find((m) => m.t === "audio") as { seq: number }).seq).toBe(1);
  });

  it("a socket WE closed does not reconnect", () => {
    const fakes: ReturnType<typeof fakeSocket>[] = [];
    const s = new VoiceSession({
      connect: () => {
        const f = fakeSocket();
        fakes.push(f);
        return f.socket;
      },
    });
    s.start();
    fakes[0].open();
    s.end("user");
    fakes[0].drop();
    expect(fakes).toHaveLength(1);
  });

  it("pings every 20 seconds so a long hold does not lose the socket", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    jest.advanceTimersByTime(61_000);
    expect(fake.sent.filter((m) => m.t === "ping").length).toBe(3);
    fake.reply({ t: "pong" });
    expect(s.state).not.toBe("error");
  });
});

/**
 * A4R7-15 (the A-4 audit, round 7) — a dropped socket kept the words on the
 * screen and lost them from the record. The scripted server held each
 * conversation's transcript in the SOCKET, and a reconnect is a new socket: the
 * resume handed back nothing, and the summary filed at the end held only what
 * was said after the drop — "Talked with your EA", for a conversation that had
 * been about Andy. §4.11 keys a session by its `sessionId`; the reference
 * server does too now, and hands the transcript back under the ids its lines
 * first carried, so the client keeps one row of each and acts on none twice.
 */
describe("A4R7-15 · a drop mid-conversation keeps, and files, what was said before it", () => {
  const pause = () => new Promise((r) => setTimeout(r, 20));

  it("the summary filed after a reconnect holds the first utterance, and the client keeps one row of it", async () => {
    jest.useRealTimers();
    reset();
    const s = new VoiceSession({ connect: () => mockVoiceSocket({ step: 1 }) });
    s.start({ style: "warm", speed: 1 });
    await pause();
    s.pushAudio("a");
    s.pushAudio("b");
    s.pushAudio("c");
    await pause();
    expect(s.transcript.at(-1)?.text).toBe("What's most urgent?");

    __dropVoiceSocketForTests(); // the rig's tunnel (VP-09)
    await pause();
    expect(s.state).toBe("listening"); // reconnected, not ended
    s.sendText("and after the tunnel");
    await pause();
    s.end("user");
    await pause();

    const filed = get().brainItems[0];
    expect(filed.source).toBe("voice");
    expect(filed.text).toContain("What's most urgent?");
    expect(filed.text).toContain("and after the tunnel");
    expect(s.transcript.filter((r) => r.text === "What's most urgent?")).toHaveLength(1);
  });

  it("a final the server sends again under its id replaces its row, and its words are not acted on twice", () => {
    const fakes: ReturnType<typeof fakeSocket>[] = [];
    const s = new VoiceSession({
      cueWord: "over",
      connect: () => {
        const f = fakeSocket();
        fakes.push(f);
        return f.socket;
      },
    });
    s.start();
    fakes[0].open();
    fakes[0].reply({ t: "final", text: "book the flights, over", id: "l1" });
    expect(fakes[0].sent.filter((m) => m.t === "turn")).toHaveLength(1);

    fakes[0].drop();
    fakes[1].open();
    // the resume's hand-back: the same line, under the id it first carried
    fakes[1].reply({ t: "final", text: "book the flights, over", id: "l1" });
    expect(s.transcript.filter((r) => r.text === "book the flights, over")).toHaveLength(1);
    // a replayed cue word ends no second turn
    expect(fakes[1].sent.some((m) => m.t === "turn")).toBe(false);
  });
});

/**
 * A4R11-08 (the A-4 audit, round 11) — every line typed into Talk was shown
 * twice: `sendText` drew the row, and the server's echoed `final` drew it
 * again through `onFinal`. The line is keyed by the client's id now, and the
 * echo carries it back, so it replaces the row it belongs to.
 */
describe("A4R11-08 · a typed line is shown once", () => {
  it("a typed line and the server's echo of it are one row", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    s.sendText("what did Andy say");
    const sent = fake.sent.at(-1) as { t: string; text: string; id?: string };
    expect(sent).toMatchObject({ t: "text", text: "what did Andy say" });
    fake.reply({ t: "final", text: "what did Andy say", id: sent.id });
    expect(s.transcript.filter((r) => r.text === "what did Andy say")).toHaveLength(1);
  });

  it("the echo still decides a typed line's words, once: a typed end phrase asks, and its replay does not ask again", () => {
    const { s, fake } = session();
    s.start();
    fake.open();
    s.sendText("thanks, that's it");
    const { id } = fake.sent.at(-1) as { id?: string };
    fake.reply({ t: "final", text: "thanks, that's it", id });
    fake.reply({ t: "final", text: "thanks, that's it", id }); // a resume's hand-back
    expect(fake.sent.filter((m) => m.t === "turn" && (m as { intent?: string }).intent === "end?")).toHaveLength(1);
  });

  it("a line typed while the connection is down goes again on the reconnect, under its id, and is shown once", () => {
    const fakes: ReturnType<typeof fakeSocket>[] = [];
    const s = new VoiceSession({
      connect: () => {
        const f = fakeSocket();
        fakes.push(f);
        return f.socket;
      },
    });
    s.start();
    fakes[0].open();
    fakes[0].drop();
    fakes[1].drop(); // still down: the next attempt waits a second
    s.sendText("typed in the tunnel"); // into a socket that is gone
    jest.advanceTimersByTime(1_000);
    fakes[2].open();
    const resent = fakes[2].sent.filter((m) => m.t === "text") as { t: "text"; text: string; id?: string }[];
    expect(resent).toEqual([{ t: "text", text: "typed in the tunnel", id: expect.any(String) }]);
    fakes[2].reply({ t: "final", text: "typed in the tunnel", id: resent[0].id });
    expect(s.transcript.filter((r) => r.text === "typed in the tunnel")).toHaveLength(1);
  });
});

describe("VP-01 · the union in lib/voice.ts is the contract's", () => {
  /**
   * A type-level check, and it earns its place: `data/routes.ts` and the
   * adapter disagreed about a body twice in this build (B-24, B-29), both
   * times because nothing compared the declaration to the traffic. Here the
   * comparison is the compiler's — an extra or missing member of either
   * union fails `pnpm check`, not a test that has to be run.
   */
  it("every documented client and server message is assignable", () => {
    const client: ClientMessage[] = [
      { t: "start", sessionId: "vs-1", voice: { style: "warm", speed: 1 } },
      { t: "start", sessionId: "vs-1", voice: { style: "warm", speed: 1 }, resume: true },
      { t: "audio", seq: 0, chunk: "" },
      { t: "text", text: "" },
      { t: "text", text: "", id: "vs-1-t1" },
      { t: "hold" },
      { t: "resume" },
      { t: "turn" },
      { t: "turn", intent: "end?" },
      { t: "presence" },
      { t: "ping" },
      { t: "end", reason: "user" },
      { t: "end", reason: "confirmed" },
      { t: "end", reason: "absent" },
    ];
    const server: ServerMessage[] = [
      { t: "interim", text: "" },
      { t: "final", text: "" },
      { t: "final", text: "", id: "l1" },
      { t: "turn?" },
      { t: "reply", text: "", sources: [] },
      { t: "speak", text: "" },
      { t: "speak", text: "", audioRef: "blob:1" },
      { t: "filed", routed: [] },
      { t: "pong" },
      { t: "error", reason: "" },
      { t: "end", summaryRef: "brain:1" },
    ];
    // and the counts, so a member DELETED from either union is caught too —
    // the assignments above only prove that what is listed still fits
    expect(new Set(client.map((m) => m.t)).size).toBe(9);
    expect(new Set(server.map((m) => m.t)).size).toBe(9);
  });
});

describe("VP-03 · the scripted server plays the conversation and files it", () => {
  it("greets, transcribes, replies, and files a brain item on end", async () => {
    jest.useRealTimers();
    reset();
    const before = get().brainItems.length;

    const heard: VoiceEvent[] = [];
    const s = new VoiceSession({ connect: () => mockVoiceSocket({ step: 1 }) });
    s.on((e) => heard.push(e));
    s.start({ style: "warm", speed: 1 });
    await new Promise((r) => setTimeout(r, 20));

    s.pushAudio("a");
    s.pushAudio("b");
    s.pushAudio("c");
    await new Promise((r) => setTimeout(r, 20));
    expect(heard.some((m) => m.t === "final" && m.text === "What's most urgent?")).toBe(true);
    const rows: TranscriptRow[] = s.transcript;
    expect(rows.at(-1)).toEqual({ role: "you", text: "What's most urgent?" });

    s.turn();
    await new Promise((r) => setTimeout(r, 30));
    expect(heard.some((m) => m.t === "reply")).toBe(true);
    expect(heard.some((m) => m.t === "filed")).toBe(true);

    s.end("user");
    await new Promise((r) => setTimeout(r, 20));
    expect(get().brainItems.length).toBe(before + 1);
    expect(get().brainItems[0].source).toBe("voice");
    expect(get().brainItems[0].text).toContain("What's most urgent?");
  });
});

describe("the browser glue, which nothing else runs", () => {
  /**
   * `webSocket`, `browserSpeak` and `captureAudio` are the three functions
   * that only work in a browser, so they are the three most likely to be
   * wrong and never noticed. Fakes for all three: the point is not that a
   * WebSocket works, it is that THIS wrapper does what the session expects
   * of it.
   */
  type Globals = { WebSocket?: unknown; speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown; MediaRecorder?: unknown };
  const g = globalThis as Globals;
  const saved = { ...g };
  afterEach(() => {
    Object.assign(g, saved);
  });

  it("webSocket sends JSON, parses JSON, and survives a frame it cannot parse", () => {
    const listeners: Record<string, ((e?: unknown) => void)[]> = {};
    const sent: string[] = [];
    g.WebSocket = class {
      OPEN = 1;
      readyState = 1;
      addEventListener(name: string, cb: (e?: unknown) => void) {
        (listeners[name] ??= []).push(cb);
      }
      send(s: string) {
        sent.push(s);
      }
      close() {
        listeners.close?.forEach((cb) => cb());
      }
    };
    const s = webSocket("wss://example.test/voice");
    const got: ServerMessage[] = [];
    s.onMessage((m) => got.push(m));
    s.send({ t: "ping" });
    expect(sent).toEqual(['{"t":"ping"}']);

    listeners.message?.forEach((cb) => cb({ data: '{"t":"pong"}' }));
    expect(got).toEqual([{ t: "pong" }]);

    // a frame this client cannot read is the server's problem to fix, not a
    // reason to drop a conversation someone is having
    expect(() => listeners.message?.forEach((cb) => cb({ data: "<html>502</html>" }))).not.toThrow();
    expect(got).toHaveLength(1);
  });

  it("browserSpeak says so when there is no synthesiser, rather than going quiet", () => {
    delete g.speechSynthesis;
    delete g.SpeechSynthesisUtterance;
    expect(browserSpeak("hello")).toBe(false);

    const spoken: { text: string; rate?: number }[] = [];
    g.SpeechSynthesisUtterance = class {
      rate?: number;
      constructor(public text: string) {}
    };
    g.speechSynthesis = { speak: (u: { text: string; rate?: number }) => spoken.push(u) };
    const voice: VoiceStyle = { style: "warm", speed: 1.2 };
    expect(browserSpeak("hello", voice)).toBe(true);
    expect(spoken).toEqual([expect.objectContaining({ text: "hello", rate: 1.2 })]);
  });

  /**
   * `captureAudio` was tested here until V-1 moved it into `lib/mic.ts`
   * (ADR-49: one owner for the microphone, hard rule 12c). Its cases moved
   * with it, and grew: `tests/unit/mic.test.ts` now asserts the 250ms
   * timeslice's successor — the mime type chosen with `isTypeSupported`
   * (MC-09), and every exit path releasing every track (MC-07), which the
   * version tested here never did. Recorded in `02_ACCEPTANCE_TESTS_v22.md`
   * §4. `browserSpeak` and `webSocket` stay: neither opens a capture device.
   */
});

describe("VP-08 / VP-10 · the presence checks, on the mock's own clock", () => {
  /**
   * Driven at the SOCKET, not through the session: what is under test is the
   * server's side of §4.11's presence rule, and the client's only part in it
   * is the `ping` that carries the clock forward.
   *
   * TWO clocks, and the distinction matters. Jest's fake timers advance the
   * scripted server's own delivery delays; `db.reset(offset)` moves the
   * MOCK's clock, which is the one the presence rule reads. Twenty minutes
   * of a person's silence therefore costs this test nothing — which is the
   * only reason a rule about twenty-minute silences is testable at all.
   */
  const tick = () => jest.advanceTimersByTime(20);

  it("asks at ten minutes held and ends at twenty, filing the summary", () => {
    reset();
    const before = get().brainItems.length;
    const heard: ServerMessage[] = [];
    const sock = mockVoiceSocket({ step: 1 });
    sock.onMessage((m) => heard.push(m));
    sock.onOpen(() => undefined);
    tick();

    sock.send({ t: "start", sessionId: "vs-1", voice: { style: "warm", speed: 1 } });
    sock.send({ t: "text", text: "what's most urgent" });
    sock.send({ t: "hold" });
    tick();

    // ten minutes later the only traffic is the client's keepalive, and that
    // is what re-checks: nothing ticks in a mock nobody is holding
    reset(10 * 60_000 + 1_000);
    sock.send({ t: "ping" });
    tick();
    expect(heard.some((m) => m.t === "speak" && m.text.startsWith("Still here?"))).toBe(true);

    reset(20 * 60_000 + 1_000);
    sock.send({ t: "ping" });
    tick();
    expect(heard.some((m) => m.t === "speak" && m.text.includes("20 minutes quiet"))).toBe(true);
    expect(heard.some((m) => m.t === "end")).toBe(true);
    // and it is FILED. An absent end is still an end, not a discard — the
    // conversation happened whether or not anyone came back to it.
    expect(get().brainItems.length).toBe(before + 1);
  });

  it("a hold sent while already held does not restart the absence clock (AUDIT_v21 A-2)", () => {
    // The client re-arms its hold after every utterance it hears — including
    // the ten-minute check itself (`spoken() → armHold() → hold()`), so a
    // second `hold` reaches the server right after "Still here?". The server
    // re-stamped `heldAt` on every `hold`, the twenty-minute end was measured
    // from that re-stamp, and VP-10's end was unreachable in a browser: the
    // auditor held a session for 31 minutes and it never ended. The absence
    // clock runs from the FIRST hold; only `resume` or an answer clears it.
    reset();
    const before = get().brainItems.length;
    const heard: ServerMessage[] = [];
    const sock = mockVoiceSocket({ step: 1 });
    sock.onMessage((m) => heard.push(m));
    sock.onOpen(() => undefined);
    tick();

    sock.send({ t: "start", sessionId: "vs-1", voice: { style: "warm", speed: 1 } });
    sock.send({ t: "text", text: "what's most urgent" });
    sock.send({ t: "hold" });
    tick();

    reset(10 * 60_000 + 1_000);
    sock.send({ t: "ping" });
    tick();
    expect(heard.some((m) => m.t === "speak" && m.text.startsWith("Still here?"))).toBe(true);
    // the client heard the check, spoke nothing, and re-armed its hold
    sock.send({ t: "hold" });
    tick();

    reset(20 * 60_000 + 1_000);
    sock.send({ t: "ping" });
    tick();
    expect(heard.some((m) => m.t === "end")).toBe(true);
    expect(get().brainItems.length).toBe(before + 1);
  });

  it("answering the check resets it — a person who speaks is not absent", () => {
    reset();
    const heard: ServerMessage[] = [];
    const sock = mockVoiceSocket({ step: 1 });
    sock.onMessage((m) => heard.push(m));
    sock.onOpen(() => undefined);
    sock.send({ t: "start", sessionId: "vs-2", voice: { style: "warm", speed: 1 } });
    sock.send({ t: "hold" });
    tick();

    reset(10 * 60_000 + 1_000);
    sock.send({ t: "ping" });
    tick();
    sock.send({ t: "resume" });

    reset(21 * 60_000);
    sock.send({ t: "ping" });
    tick();
    expect(heard.some((m) => m.t === "end")).toBe(false);
  });
});

/**
 * A-0 review, R-06. Three things the talk surface promised and the code did
 * not keep. (1) VP-07: "the mic is muted while the EA is speaking so it does
 * not hear itself" — `speaking` lasted zero milliseconds, so the microphone
 * was live for the whole of every spoken reply. (2) A dropped socket
 * reconnected in a tight loop with no backoff and no end: a dead server
 * meant a phone opening sockets forever. (3) The store's `speak` was gated on
 * `muted`, so muting the MICROPHONE also silenced the EA, against the
 * button's own label.
 */
describe("R-06 · speaking lasts as long as the speech, and the mic is deaf meanwhile", () => {
  it("chunks pushed while the EA speaks are dropped; listening resumes when the speech ends", async () => {
    let finished: () => void = () => {};
    const { s, fake } = session({ speak: () => new Promise<void>((r) => (finished = r)) });
    s.start();
    fake.open();
    fake.reply({ t: "speak", text: "here is what I found" });
    expect(s.state).toBe("speaking");

    s.pushAudio("the EA's own voice, echoed");
    expect(fake.sent.filter((m) => m.t === "audio")).toHaveLength(0);

    finished();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.state).toBe("listening");
    s.pushAudio("now me");
    expect(fake.sent.filter((m) => m.t === "audio")).toHaveLength(1);
  });

  it("a speaker that reports nothing (no synthesiser, native) returns to listening at once — the old contract", () => {
    const { s, fake, spoken } = session();
    s.start();
    fake.open();
    fake.reply({ t: "speak", text: "quick" });
    expect(spoken).toEqual(["quick"]);
    expect(s.state).toBe("listening");
  });

  it("a synthesiser that never says it finished is capped, so the mic comes back", () => {
    const { s, fake } = session({ speak: () => new Promise<void>(() => {}) });
    s.start();
    fake.open();
    fake.reply({ t: "speak", text: "a".repeat(40) });
    expect(s.state).toBe("speaking");
    jest.advanceTimersByTime(1000 + 60 * 40 - 1);
    expect(s.state).toBe("speaking");
    jest.advanceTimersByTime(2);
    expect(s.state).toBe("listening");
  });

  it("an `end` from the server while speaking wins — the cap does not resurrect the session", () => {
    const { s, fake } = session({ speak: () => new Promise<void>(() => {}) });
    s.start();
    fake.open();
    fake.reply({ t: "speak", text: "bye" });
    fake.reply({ t: "end", summaryRef: "brain:x" });
    expect(s.state).toBe("ended");
    jest.advanceTimersByTime(60_000);
    expect(s.state).toBe("ended");
  });
});

describe("R-06 · a dropped socket backs off, and gives up honestly", () => {
  function dropping() {
    const fakes: ReturnType<typeof fakeSocket>[] = [];
    const s = new VoiceSession({
      connect: () => {
        const f = fakeSocket();
        fakes.push(f);
        return f.socket;
      },
    });
    return { s, fakes };
  }

  it("the first retry is immediate, the next ones wait 1, 2, 4 and 8 seconds, and the sixth drop is the end", () => {
    const { s, fakes } = dropping();
    const errors: string[] = [];
    s.on((e) => e.t === "error" && errors.push(e.reason));
    s.start();
    fakes[0].open();

    fakes[0].drop();
    expect(fakes).toHaveLength(2); // VP-09: a blip is retried at once
    const waits = [1000, 2000, 4000, 8000];
    for (const wait of waits) {
      fakes[fakes.length - 1].drop();
      const before = fakes.length;
      jest.advanceTimersByTime(wait - 1);
      expect(fakes).toHaveLength(before);
      jest.advanceTimersByTime(1);
      expect(fakes).toHaveLength(before + 1);
    }
    expect(s.state).toBe("starting");

    fakes[fakes.length - 1].drop();
    jest.advanceTimersByTime(60_000);
    expect(fakes).toHaveLength(6);
    expect(s.state).toBe("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/connection/i);
  });

  it("a socket that opens resets the count — five drops over a long conversation are five blips", () => {
    const { s, fakes } = dropping();
    s.start();
    fakes[0].open();
    for (let i = 0; i < 7; i++) {
      fakes[fakes.length - 1].drop();
      jest.advanceTimersByTime(10);
      fakes[fakes.length - 1].open();
    }
    expect(s.state).toBe("listening");
    expect(fakes).toHaveLength(8);
  });

  it("ending during the wait cancels the reconnect", () => {
    const { s, fakes } = dropping();
    s.start();
    fakes[0].open();
    fakes[0].drop();
    fakes[1].drop(); // now waiting 1s
    s.end("user");
    jest.advanceTimersByTime(60_000);
    expect(fakes).toHaveLength(2);
    expect(s.state).toBe("ended");
  });
});

describe("R-06 · browserSpeak can say when it is done", () => {
  const g = globalThis as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
  afterEach(() => {
    delete g.speechSynthesis;
    delete g.SpeechSynthesisUtterance;
  });

  it("calls onDone when the utterance ends, and on an error, once", () => {
    const utterances: { text: string; onend?: () => void; onerror?: () => void }[] = [];
    g.SpeechSynthesisUtterance = class {
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    };
    g.speechSynthesis = { speak: (u: { text: string }) => utterances.push(u) };
    let done = 0;
    expect(browserSpeak("hello", undefined, () => done++)).toBe(true);
    expect(done).toBe(0);
    utterances[0].onend?.();
    utterances[0].onerror?.();
    expect(done).toBe(1);
  });
});

describe("VP-14 · the phrases are data, and a removed one no longer triggers", () => {
  it("a phrase taken out of the list is just words; a phrase added is an ask", () => {
    const edited = ["that's all", "wrap it up"]; // "goodbye" removed, "wrap it up" added
    const { s, fake } = session({ endPhrases: edited });
    s.start();
    fake.open();
    fake.reply({ t: "final", text: "goodbye" });
    expect(fake.sent.some((m) => m.t === "turn" && (m as { intent?: string }).intent === "end?")).toBe(false);
    expect(s.state).toBe("listening");
    fake.reply({ t: "final", text: "wrap it up" });
    expect(fake.sent.some((m) => m.t === "turn" && (m as { intent?: string }).intent === "end?")).toBe(true);
  });
});
