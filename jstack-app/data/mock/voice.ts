/**
 * The scripted voice server (V-1, VP-03) — one implementation of `Socket`,
 * playing the conversation mock v11's Talk sheet shows, so the whole of
 * §4.11 can be driven with no provider, no key and no network.
 *
 * It is a SERVER, not a fixture: it answers the messages the client sends,
 * in the order it sends them, and it enforces the rules the real one will —
 * silence never ends anything, a turn ends only when the client says so,
 * `ping` is answered, a `resume: true` start hands the transcript back. A
 * script that simply played eight messages at eight delays would prove the
 * UI renders and nothing about the protocol.
 *
 * The pauses are the interesting part and they are on the clock the rest of
 * the mock uses (`db.now()`, offsettable by the rig), so a test can put
 * three minutes or thirty into a session without waiting for either.
 */
import * as db from "@/data/mock/db";
import type { ClientMessage, ServerMessage, Socket } from "@/lib/voice";

/** the EA's opening line — mock v11's own Talk copy. */
const GREETING = "Morning. Three things need you and Andy's call is at nine. Where do you want to start?";

const REPLY = "Andy's is the one with a deadline: he needs the V2 start date before he can book his team. I've drafted a reply saying the 15th — want me to send it?";

/**
 * TS-02: the same answer, in one sentence, for `brevity: "brief"` — which is
 * the default. Josh will use Talk a lot and a paragraph read aloud is a
 * paragraph you cannot skim; a brief reply is the thing you can act on and
 * ask a follow-up to.
 *
 * The scripted mock honours the flag rather than ignoring it, because a
 * setting the server accepts and does nothing with is a claim with no gate
 * behind it (rule 15) — TS-02 asserts the shorter answer actually arrives.
 */
const REPLY_BRIEF = "Andy needs the V2 start date — I've drafted the 15th. Send it?";

/** the brevity the live session asked for, from its `start` */
let brevity: "brief" | "full" = "brief";

const SOURCES = [
  { label: "Andy", ref: "email:andy-v2-start" },
  { label: "Calendar", ref: "cal:andy-kickoff" },
];

/** §4.11: after ten minutes held the server asks; a second unanswered check
 * at twenty ends the session with the summary filed. The exec brief said
 * thirty and sixty — the CONTRACT says ten and twenty, and the contract is
 * what a backend will be built to, so these are ten and twenty. */
const PRESENCE_AT_MS = 10 * 60_000;
const ABSENT_AT_MS = 20 * 60_000;

/**
 * The rig's forced drop (VP-09): closes the LAST socket this module handed
 * out, without the client having asked. That is what a tunnel does, and it
 * is the only way to prove the reconnect from a browser.
 *
 * Module-level rather than a handle passed around because the caller is
 * `__JSTACK__.voice.drop()`, which has no reference to the socket — and
 * because there is only ever one session (`stores/voice.ts` refuses a
 * second), so "the last one" is unambiguous.
 */
let live: Socket | null = null;

export function __dropVoiceSocketForTests(): void {
  live?.close();
}

/**
 * A4R7-15: what each conversation has said, keyed by its `sessionId` — the key
 * §4.11's resume names. It lived in the socket, and a reconnect is a new
 * socket, so `start { resume: true }` handed back nothing and `finish` filed
 * only what came after the drop: the screen kept "What's most urgent?" and the
 * summary read "Talked with your EA". Module-level for the reason `live` is:
 * the conversation outlives the socket it started on.
 */
type Line = { id: string; text: string };
const conversations = new Map<string, Line[]>();

type Timing = { step: number };

export function mockVoiceSocket(timing: Timing = { step: 60 }): Socket {
  let onMessage: (m: ServerMessage) => void = () => {};
  let onClose: () => void = () => {};
  let open: (() => void) | null = null;
  let closed = false;
  let heldAt: number | null = null;
  let presenceAsked = false;
  let saidTurnQuestion = false;
  let ended = false;
  /** this conversation's lines — its entry in `conversations` once `start` names it */
  let lines: Line[] = [];
  let sessionId: string | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const later = (fn: () => void, mult = 1) => {
    const id = setTimeout(() => {
      if (!closed) fn();
    }, timing.step * mult);
    (id as unknown as { unref?: () => void }).unref?.();
    timers.push(id);
  };

  const say = (m: ServerMessage, mult = 1) => later(() => onMessage(m), mult);

  /** a line the conversation heard: kept under the client's id for a typed line
   * or one of its own, and said back as a final that carries it (A4R7-15,
   * A4R11-08) */
  const heard = (text: string, id?: string) => {
    const line = { id: id ?? `l${lines.length + 1}`, text };
    lines.push(line);
    say({ t: "final", text, id: line.id });
  };

  /** the held clock, checked whenever anything happens — no interval, so a
   * session nobody is holding costs nothing and a test can jump the clock. */
  const checkPresence = () => {
    if (heldAt == null || ended) return;
    const heldFor = db.now().getTime() - heldAt;
    if (!presenceAsked && heldFor >= PRESENCE_AT_MS) {
      presenceAsked = true;
      say({ t: "speak", text: "Still here? Say anything to continue." });
      return;
    }
    if (presenceAsked && heldFor >= ABSENT_AT_MS) {
      // §4.11 sends a push here ("Conversation ended · 20 minutes quiet").
      // There is no push service behind a mock, and inventing a fifth
      // message type to carry it would put something in the client that no
      // backend will send — so it arrives as the `speak` it would anyway be
      // read out as, and the client shows it like any other line.
      say({ t: "speak", text: "Conversation ended · 20 minutes quiet." });
      finish("absent");
    }
  };

  const finish = (reason: "user" | "confirmed" | "absent") => {
    if (ended) return;
    ended = true;
    if (sessionId != null) conversations.delete(sessionId);
    // VP-03: the summary is a real brain item, because "the conversation is
    // filed" is a promise the app makes on screen and a promise nobody can
    // check is a promise nobody should make.
    const state = db.get();
    const id = `bv-${Math.random().toString(36).slice(2, 8)}`;
    const at = db.now();
    state.brainItems = [
      {
        id,
        text: lines.length > 0 ? lines.map((l) => l.text).join(" · ") : "Talked with your EA",
        at: at.toISOString(),
        meta: `voice${reason === "absent" ? " · ended quiet" : ""}`,
        source: "voice",
        routed: [],
        labels: { silo: "personal:josh", types: ["unlabelled"], setBy: "review" },
        setAt: at.toISOString(),
        focus: "all",
      },
      ...state.brainItems,
    ];
    say({ t: "end", summaryRef: `brain:${id}` });
  };

  const handle = (msg: ClientMessage) => {
    checkPresence();
    switch (msg.t) {
      case "start":
        sessionId = msg.sessionId;
        if (msg.resume) {
          // VP-09: the transcript comes back, and no turn is replayed — a
          // reconnect that re-answered the last question would be worse than
          // one that dropped it. A4R7-15: the CONVERSATION's transcript, under
          // the ids its lines first carried, so the client keeps one row of each.
          lines = conversations.get(msg.sessionId) ?? [];
          conversations.set(msg.sessionId, lines);
          for (const line of lines) say({ t: "final", text: line.text, id: line.id });
          return;
        }
        lines = [];
        conversations.set(msg.sessionId, lines);
        brevity = msg.voice?.brevity ?? "brief";
        say({ t: "speak", text: GREETING });
        return;
      case "audio":
        // one interim per few chunks, then the final — enough to prove the
        // UI shows speech arriving, without pretending to be a recogniser.
        if (msg.seq === 0) say({ t: "interim", text: "what's" });
        if (msg.seq === 1) say({ t: "interim", text: "what's most urgent" });
        if (msg.seq === 2) {
          heard("What's most urgent?");
          if (!saidTurnQuestion) {
            saidTurnQuestion = true;
            // the server BELIEVES the utterance is done. ADR-24 says the
            // client decides, and this is where that gets proven.
            say({ t: "turn?" }, 2);
          }
        }
        return;
      case "text": {
        // A4R11-08: a line sent again under an id already heard is said back,
        // not added — the client resends what it typed while the socket was down
        const known = msg.id == null ? undefined : lines.find((l) => l.id === msg.id);
        if (known != null) say({ t: "final", text: known.text, id: known.id });
        else heard(msg.text, msg.id);
        return;
      }
      case "hold":
        // The absence clock runs from the FIRST hold. The client re-arms its
        // hold after every utterance it hears — the ten-minute check included
        // — so re-stamping here restarted the clock each time the check was
        // spoken and the twenty-minute end was unreachable in a browser
        // (AUDIT_v21.md A-2: a session held 31 minutes never ended). Only
        // `resume` or an answer clears it.
        if (heldAt == null) heldAt = db.now().getTime();
        return;
      case "resume":
        heldAt = null;
        presenceAsked = false;
        return;
      case "presence":
        presenceAsked = false;
        return;
      case "turn":
        if (msg.intent === "end?") {
          say({ t: "speak", text: "End the conversation? Yes or no." });
          return;
        }
        {
          const answer = brevity === "brief" ? REPLY_BRIEF : REPLY;
          // TS-03 / VO-A: the spoken half carries an `audioRef`. No fixture in
          // V2.1 ever sent one, so `lib/voice/audio.ts`'s player had no caller
          // and the carried defect could not be tested — this is the turn that
          // gives it one.
          say({ t: "reply", text: answer, sources: SOURCES });
          say({ t: "speak", text: answer, audioRef: "voice:andy-reply" }, 2);
        }
        say({ t: "filed", routed: ["Tasks · reply to Andy"] }, 3);
        return;
      case "ping":
        say({ t: "pong" });
        return;
      case "end":
        finish(msg.reason);
        return;
    }
  };

  const socket: Socket = {
    send: (msg) => {
      if (!closed) handle(msg);
    },
    close: () => {
      closed = true;
      for (const id of timers) clearTimeout(id);
      onClose();
    },
    onOpen: (cb) => {
      open = cb;
      const id = setTimeout(() => open?.(), 0);
      (id as unknown as { unref?: () => void }).unref?.();
      timers.push(id);
    },
    onMessage: (cb) => (onMessage = cb),
    onClose: (cb) => (onClose = cb),
  };
  live = socket;
  return socket;
}
