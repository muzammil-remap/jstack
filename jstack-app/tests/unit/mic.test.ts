/**
 * lib/mic.ts — the one owner of the microphone (V-1, ADR-49).
 *
 * Josh: "Mic staying on and I don't know how to turn it off — this must never
 * happen." Every case here is a way that used to be possible.
 *
 * B-17: this file CREATES the browser globals it needs rather than assuming
 * them. The local jest-expo lane happens to have `navigator` and the CI runner
 * does not, which is how eleven cases once went green here and red on the
 * board. Everything is installed in `beforeEach` and removed after.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { autoStopNotice, activeMic, micMimeType, startMic, stopActiveMic, stopMicFor, __resetMicForTests } from "@/lib/mic";
import { emitServerEvent } from "@/data/mock/events";
import { armRefreshReuse } from "@/data/mock/handlers/session";
import { refreshAccessToken } from "@/lib/authTokens";
import { subscribeServerEvents } from "@/lib/serverEvents";
import { useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { useVoiceStore } from "@/stores/voice";

/** a MediaStream that counts how many times each of its tracks was stopped */
function fakeStream(trackCount = 2) {
  const stops: number[] = new Array(trackCount).fill(0);
  const tracks = stops.map((_, i) => ({
    kind: "audio",
    stop: () => {
      stops[i] += 1;
    },
  }));
  return { stream: { getTracks: () => tracks }, stops };
}

type Globals = Record<string, unknown>;
const g = globalThis as unknown as Globals;
const saved: Globals = {};
const KEYS = ["navigator", "MediaRecorder", "SpeechRecognition", "webkitSpeechRecognition"];

function install(opts: {
  stream?: { getTracks: () => { stop: () => void }[] } | null;
  getUserMediaError?: Error;
  mimes?: string[];
  recorderThrows?: boolean;
  speech?: boolean;
}) {
  const mimes = opts.mimes ?? ["audio/webm;codecs=opus"];
  g.navigator = {
    mediaDevices: {
      getUserMedia: () => (opts.getUserMediaError ? Promise.reject(opts.getUserMediaError) : Promise.resolve(opts.stream)),
    },
  };
  class Rec {
    state = "recording";
    ondataavailable: ((e: unknown) => void) | null = null;
    constructor() {
      if (opts.recorderThrows) throw new Error("constructor blew up");
    }
    start() {}
    stop() {
      this.state = "inactive";
    }
    static isTypeSupported(m: string) {
      return mimes.includes(m);
    }
  }
  if (opts.mimes === null) delete g.MediaRecorder;
  else g.MediaRecorder = Rec;
  if (opts.speech === false) {
    delete g.SpeechRecognition;
    delete g.webkitSpeechRecognition;
  } else {
    class SR {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: unknown = null;
      onerror: unknown = null;
      start() {}
      stop() {}
    }
    g.SpeechRecognition = SR;
  }
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = g[k];
  __resetMicForTests();
});

afterEach(() => {
  stopActiveMic();
  __resetMicForTests();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete g[k];
    else g[k] = saved[k];
  }
});

describe("MC-09 · the mime type is chosen, never assumed", () => {
  it("prefers webm/opus, falls back to audio/mp4 where only that is supported (Safari)", () => {
    install({ mimes: ["audio/webm;codecs=opus", "audio/mp4"] });
    expect(micMimeType()).toBe("audio/webm;codecs=opus");

    install({ mimes: ["audio/mp4"] });
    expect(micMimeType()).toBe("audio/mp4");
  });

  it("a MediaRecorder with no isTypeSupported counts as unsupported, not as a default", () => {
    install({ mimes: [] });
    // and the harder case the row names: the API exists but the probe does not
    (g.MediaRecorder as unknown as { isTypeSupported?: unknown }).isTypeSupported = undefined;
    expect(micMimeType()).toBeNull();
  });

  it("no MediaRecorder at all is unsupported", () => {
    install({ mimes: null as unknown as string[] });
    expect(micMimeType()).toBeNull();
  });
});

describe("MC-07 · every exit path releases every track", () => {
  it.each([
    ["stop()", (h: { stop: () => void }) => h.stop()],
    ["stopActiveMic() — what relock() calls", () => stopActiveMic()],
  ])("%s calls track.stop() on every track of the stream", async (_name, exit) => {
    const { stream, stops } = fakeStream(3);
    install({ stream });
    const handle = await startMic({ purpose: "brain" });
    expect(stops).toEqual([0, 0, 0]);

    exit(handle);
    expect(stops).toEqual([1, 1, 1]);
  });

  it("stop() is idempotent — a second call does not stop a track twice", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream });
    const handle = await startMic({ purpose: "brain" });
    handle.stop();
    handle.stop();
    handle.stop();
    expect(stops).toEqual([1, 1]);
  });

  /**
   * A4R10-03 (A-4 round 10), security-class: two locks went round `relock()` —
   * the server signing this device out, and a refresh token caught being
   * reused — by setting `locked` directly, so the gate came down over a mic
   * that was still listening. Every lock now goes through `relock()` or
   * `lock()`, the two that release it, and the source guard below keeps it so.
   */
  it("A4R10-03: the server's sign-out (a `session` server event) releases every track", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream });
    await startMic({ purpose: "brain" });
    const off = subscribeServerEvents();
    try {
      emitServerEvent({ kind: "session", ids: [], at: new Date().toISOString() });
      await new Promise((r) => setTimeout(r, 150)); // the events coalesce for 50 ms
      expect(stops).toEqual([1, 1]);
      expect(useSessionStore.getState().locked).toBe(true);
    } finally {
      off();
    }
  });

  it("A4R10-03: a refresh token caught being reused locks AND releases every track", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream });
    await startMic({ purpose: "brain" });
    useSessionStore.setState({ locked: false, emergency: false });
    armRefreshReuse();
    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 401, reason: "reuse" });
    expect(stops).toEqual([1, 1]);
    expect(useSessionStore.getState()).toEqual(expect.objectContaining({ locked: true, emergency: true }));
  });

  it("A4R10-03: nothing outside stores/session.ts locks the app by setting `locked` — every lock is relock() or lock()", () => {
    const app = join(__dirname, "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !p.endsWith(join("stores", "session.ts")) && /setState\(\s*\{[^}]*\blocked:\s*true/.test(readFileSync(p, "utf8"))) offenders.push(p.slice(app.length + 1));
      }
    };
    for (const d of ["lib", "components", "app", "layout", "stores"]) walk(join(app, d));
    expect(offenders).toEqual([]);
  });
});

/**
 * A4R10-03's class (A-4 round 10): a stop taken while the permission prompt is
 * up. A session was registered only once its stream arrived, and nothing after
 * the wait asked whether it had been stopped — so the lock, the banner's Stop,
 * the field's own button, a second start and Talk's End each stopped nothing,
 * and the microphone opened the moment the prompt was answered: behind a lock
 * screen, beside a session already ended, or with no handle left to stop it.
 */
describe("MC-07 · a stop taken while the permission prompt is up holds when it is answered", () => {
  /** a getUserMedia that waits, as the prompt does, until the test answers it */
  function installPrompt(): ((stream: unknown) => void)[] {
    const answers: ((stream: unknown) => void)[] = [];
    install({ stream: null });
    (g.navigator as { mediaDevices: { getUserMedia: () => Promise<unknown> } }).mediaDevices.getUserMedia = () => new Promise((resolve) => answers.push(resolve));
    return answers;
  }

  it.each([
    ["relock() — the inactivity timer, a hide, the server's sign-out, a reused token", () => useSessionStore.getState().relock()],
    ["stopActiveMic() — the banner's Stop, the field's own button, the emergency hold", () => stopActiveMic()],
  ])("%s: the stream granted afterwards is released, and the mic never reads listening", async (_name, exit) => {
    const answers = installPrompt();
    const pending = startMic({ purpose: "brain", onFinal: () => undefined });
    expect(useMicStore.getState().state).toBe("requesting");
    exit();
    const { stream, stops } = fakeStream(2);
    answers[0](stream);
    await pending;
    expect(stops).toEqual([1, 1]);
    expect(useMicStore.getState().state).toBe("off");
    expect(activeMic()).toBeNull();
  });

  it("MC-01: a second start while the first is still asking releases the first's stream when it arrives", async () => {
    const answers = installPrompt();
    const a = startMic({ purpose: "brain", onFinal: () => undefined });
    const b = startMic({ purpose: "journal", onFinal: () => undefined });
    const first = fakeStream(2);
    const second = fakeStream(2);
    answers[0](first.stream);
    answers[1](second.stream);
    await Promise.all([a, b]);
    expect(first.stops).toEqual([1, 1]);
    expect(second.stops).toEqual([0, 0]);
    expect(activeMic()).toBe(await b);
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "listening", purpose: "journal" }));
  });

  /**
   * A4R11-02 (A-4 round 11), security-class: MC-07 names "Stop, Cancel, send,
   * navigation away, unmount" as exit paths, and three of them were not built.
   * A surface whose words live in its own state releases the microphone when
   * it goes — including one still at the permission prompt, which used to open
   * once the prompt was answered, behind no surface at all.
   */
  it("A4R11-02: a surface that releases on unmount stops its session, at the prompt or listening", async () => {
    const answers = installPrompt();
    const pending = startMic({ purpose: "dictate", onFinal: () => undefined });
    // the dialog closes while the prompt is up: what `useDictation`'s unmount calls
    stopMicFor("dictate");
    const { stream, stops } = fakeStream(2);
    answers[0](stream);
    await pending;
    expect(stops).toEqual([1, 1]);
    expect(useMicStore.getState().state).toBe("off");
  });

  it("A4R11-02: releasing one surface's session never stops another's", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream });
    await startMic({ purpose: "brain", onFinal: () => undefined });
    stopMicFor("dictate");
    expect(stops).toEqual([0, 0]);
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "listening", purpose: "brain" }));
  });

  it("Talk ended while its microphone is still being asked for: released when it arrives, never handed to the session that is gone", async () => {
    const answers = installPrompt();
    useVoiceStore.getState().start();
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "requesting", purpose: "talk" }));
    useVoiceStore.getState().end();
    const { stream, stops } = fakeStream(2);
    answers[0](stream);
    await new Promise((r) => setTimeout(r, 0));
    expect(stops).toEqual([1, 1]);
    expect(useVoiceStore.getState().mic).toBeNull();
    expect(useMicStore.getState().state).toBe("off");
  });
});

describe("MC-01 · at most one microphone session app-wide", () => {
  it("starting a second session stops the first, and its tracks", async () => {
    const first = fakeStream(2);
    install({ stream: first.stream });
    const a = await startMic({ purpose: "brain" });
    expect(activeMic()).toBe(a);

    const second = fakeStream(2);
    install({ stream: second.stream });
    const b = await startMic({ purpose: "talk" });

    expect(first.stops).toEqual([1, 1]);
    expect(second.stops).toEqual([0, 0]);
    expect(activeMic()).toBe(b);
    expect(activeMic()).not.toBe(a);
  });

  it("there is no active session once it is stopped", async () => {
    const { stream } = fakeStream();
    install({ stream });
    const h = await startMic({ purpose: "journal" });
    h.stop();
    expect(activeMic()).toBeNull();
  });
});

describe("MC-06 · the auto-stop, and the notice that composes from the parameter", () => {
  it("the notice reads the value rather than spelling it", () => {
    // the row's own two forms (resolution #9)
    expect(autoStopNotice(60)).toBe("Mic off · nothing heard for a minute");
    expect(autoStopNotice(30)).toBe("Mic off · nothing heard for 30 seconds");
    // and a value nobody has written down anywhere
    expect(autoStopNotice(45)).toBe("Mic off · nothing heard for 45 seconds");
  });

  it("stops after the configured silence, releasing the tracks, and says why", async () => {
    jest.useFakeTimers();
    try {
      const { stream, stops } = fakeStream(2);
      install({ stream });
      const states: { state: string; notice?: string }[] = [];
      await startMic({
        purpose: "brain",
        autoStopSeconds: 30,
        onState: (state, detail) => states.push({ state, notice: detail?.notice }),
      });

      jest.advanceTimersByTime(29_000);
      expect(stops).toEqual([0, 0]);

      jest.advanceTimersByTime(2_000);
      expect(stops).toEqual([1, 1]);
      expect(states.at(-1)).toEqual({ state: "off", notice: "Mic off · nothing heard for 30 seconds" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("speech resets the timer — a pause mid-sentence is not silence", async () => {
    jest.useFakeTimers();
    try {
      const { stream, stops } = fakeStream(2);
      install({ stream });
      const handle = await startMic({ purpose: "brain", autoStopSeconds: 30 });

      jest.advanceTimersByTime(25_000);
      handle.heard(); // what the recogniser calls on interim text
      jest.advanceTimersByTime(25_000);
      expect(stops).toEqual([0, 0]);

      jest.advanceTimersByTime(6_000);
      expect(stops).toEqual([1, 1]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("MC-08 · unavailable is honest, and never stuck in listening", () => {
  it("a denied permission ends in error with the reason, never in listening", async () => {
    install({ stream: null, getUserMediaError: Object.assign(new Error("denied"), { name: "NotAllowedError" }) });
    const states: string[] = [];
    const handle = await startMic({ purpose: "brain", onState: (s) => states.push(s) });
    expect(states).not.toContain("listening");
    expect(states.at(-1)).toBe("error");
    expect(handle.error).toContain("permission");
    expect(activeMic()).toBeNull();
  });

  it("no microphone adds the reason NotFoundError names", async () => {
    install({ stream: null, getUserMediaError: Object.assign(new Error("none"), { name: "NotFoundError" }) });
    const handle = await startMic({ purpose: "brain" });
    expect(handle.error).toContain("no microphone found");
    expect(activeMic()).toBeNull();
  });

  /**
   * v2.3 B-9 (seen while wiring the phone's recogniser beside it, B-4): the
   * browser's recogniser, failing mid-session, set the handle's error and
   * stopped it — and a handle with an error says nothing when it stops, so no
   * terminal state was emitted at all. The device was released and every
   * surface went on reading "listening". Driven through a recogniser this case
   * holds, so its `onerror` can be fired the way a browser fires it.
   */
  function heldRecogniser() {
    const created: { onerror: ((e: { error: string }) => void) | null }[] = [];
    g.SpeechRecognition = class {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: unknown = null;
      onerror: ((e: { error: string }) => void) | null = null;
      start() {
        created.push(this);
      }
      stop() {}
    };
    return created;
  }

  it("B-9: a recogniser that fails mid-session ends in error with its reason, never still listening", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream });
    const created = heldRecogniser();
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    expect(useMicStore.getState().state).toBe("listening");

    created[0].onerror?.({ error: "network" });
    expect(stops).toEqual([1, 1]);
    expect(activeMic()).toBeNull();
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "error", error: "Mic unavailable here · type instead" }));
    expect(handle.error).toBe("Mic unavailable here · type instead");
  });

  it("B-9: a recogniser that gives up on a silence ends the session off, released, never still listening", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream });
    const created = heldRecogniser();
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });

    created[0].onerror?.({ error: "no-speech" });
    expect(stops).toEqual([1, 1]);
    expect(activeMic()).toBeNull();
    expect(useMicStore.getState().state).toBe("off");
    expect(handle.error).toBeNull();
  });

  it("a MediaRecorder constructor that throws surfaces as error, never a swallowed rejection", async () => {
    const { stream, stops } = fakeStream(2);
    install({ stream, recorderThrows: true, speech: false });
    const handle = await startMic({ purpose: "talk", onChunk: () => {} });
    expect(handle.error).not.toBeNull();
    // and it still let go of the microphone it had already opened
    expect(stops).toEqual([1, 1]);
    expect(activeMic()).toBeNull();
  });
});

/**
 * MC-01, the invariant half — hard rule 12(c): "no code outside `lib/mic.ts`
 * calls `getUserMedia`, `SpeechRecognition` or `MediaRecorder`."
 *
 * ADR-49's whole claim is that there is ONE owner. A test that only drives
 * `lib/mic.ts` proves that file releases its tracks; it cannot prove nobody
 * else opened a microphone behind its back — which is exactly what
 * `stores/voice.ts` and `lib/stt.ts` were doing, each with its own stream and
 * neither calling `track.stop()`.
 *
 * Modelled on TD-05's Date-getter guard, including the comment-blanking: a
 * guard that fails on a sentence EXPLAINING the rule teaches people to delete
 * the explanation.
 */
describe("MC-01 · lib/mic.ts is the only code that opens a microphone", () => {
  const APP_ROOT = join(__dirname, "..", "..");
  /** the app's own source. `tests/` and `e2e/` may stub whatever they like,
   * and `tools/` runs in Node with no microphone anywhere near it. */
  const SCOPE = ["app", "components", "layout", "stores", "lib", "data"];

  /** Each entry names ONE file and ONE reason (lesson 14). */
  const ALLOWED: Record<string, string> = {
    "lib/mic.ts": "the owner — this is the file the rule is about",
    "lib/testHook.ts": "the __JSTACK__.mic lever STUBS these three APIs in the test build so Playwright can drive an unavailable microphone; it opens nothing",
  };

  const MIC_API = /getUserMedia|webkitSpeechRecognition|SpeechRecognition|MediaRecorder/;

  function withoutComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  }

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
      else if (/\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }

  it("no file outside the allow-list names a microphone API", () => {
    const offenders: string[] = [];
    for (const dir of SCOPE) {
      for (const file of sourceFiles(join(APP_ROOT, dir))) {
        const rel = file.slice(APP_ROOT.length + 1).replace(/\\/g, "/");
        if (ALLOWED[rel] != null) continue;
        const code = withoutComments(readFileSync(file, "utf8"));
        code.split("\n").forEach((line, i) => {
          if (MIC_API.test(line)) offenders.push(`${rel}:${i + 1} ${line.trim().slice(0, 90)}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The guard is proven against a violation it MUST catch (lesson 14, qa A-4:
   * a count regex that could not match its own subject reported 119 of 123).
   * Without this, deleting a character from `MIC_API` would leave a green
   * guard that reads every file and finds nothing, forever.
   */
  it("catches a planted violation, so a green result means something", () => {
    const planted = withoutComments(`
      // a comment mentioning getUserMedia must NOT trip it
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    `);
    const lines = planted.split("\n").filter((l) => MIC_API.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("mediaDevices");
  });
});

/**
 * D-6 (the A-6 audit, outside A-4's cap) — Mute lets go of the microphone.
 *
 * `toggleMute` used to flip a boolean and nothing else: the chunks were
 * dropped one layer above `pushAudio` while the DEVICE went on capturing, the
 * browser's recording indicator stayed lit, and the store's own comment said
 * muting "stops the MICROPHONE". A control whose whole purpose is to stop the
 * microphone has to stop it — this is the shape of Josh's item 11, "mic
 * staying on and I don't know how to turn it off", and it is why the audit's
 * exempt list names a mic left open.
 */
describe("D-6 · Talk's Mute releases the microphone, and Unmute opens a new one", () => {
  it("muting stops the device; the session and the transcript stay", async () => {
    install({ stream: { getTracks: () => [{ stop: () => undefined }] } });
    const handle = await startMic({ purpose: "talk" });
    expect(activeMic()?.purpose).toBe("talk");

    const fakeSession = { pushAudio: () => undefined } as unknown as never;
    useVoiceStore.setState({ mic: handle, session: fakeSession, running: true, muted: false });

    useVoiceStore.getState().toggleMute();

    expect(useVoiceStore.getState().muted).toBe(true);
    expect(activeMic()).toBeNull(); // the DEVICE, not just the chunks
    expect(useVoiceStore.getState().mic).toBeNull();
    // the conversation is still up: muting is not ending
    expect(useVoiceStore.getState().running).toBe(true);
    expect(useVoiceStore.getState().session).not.toBeNull();

    useVoiceStore.setState({ mic: null, session: null, running: false, muted: false });
  });
});
