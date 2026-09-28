/**
 * B-4 (v2.3) — native dictation, behind the one microphone owner.
 *
 * `expo-speech-recognition` was installed and configured in `app.json` and
 * imported nowhere, so on the iPhone build every microphone said "Mic
 * unavailable here · type instead". `lib/mic.ts` drives the module now. It is
 * mocked here — this lane has no microphone — so what this proves is the
 * WIRING: one recogniser per start, the stop and the lock end it, a refused
 * permission falls back to typing, and Talk on a phone sends words rather than
 * audio. Whether a phone hears a sentence is Josh's check, on his own
 * development build (`DEVICE_RUNBOOK.md` §3).
 */
import { activeMic, startMic, stopActiveMic, stopMicFor, __resetMicForTests } from "@/lib/mic";
import { openTalkMic } from "@/lib/talkMic";
import { useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import type { VoiceSession } from "@/lib/voice";

type Listener = (event: unknown) => void;

/**
 * The device's recogniser, as the module presents it — counted, never trusted.
 *
 * B-11: in expo-speech-recognition's own order (3.1.3,
 * `ios/ExpoSpeechRecognizer.swift`), not a convenient one. This mock used to
 * emit `end` inside `stop()`, which no device does, and that is why nothing
 * here saw a start inside the previous recognition's finishing time. On the
 * device:
 *  - `stop()` stops the audio and only FINISHES the task: its last words, the
 *    reset and its `end` come later (`stopListening`, :499-519; the task's
 *    handler, :959-966);
 *  - `start()` resets first (:209): a task still there is cancelled, its `end`
 *    is emitted from a later hop (:487-497), and the cancelled task's handler then
 *    resets whatever task is current, which is the new one;
 *  - a start the device is not ready for is refused as `busy`, and that
 *    attempt's `end` follows (`ExpoSpeechRecognitionModule.swift:573`).
 */
const mockRecogniser = {
  started: 0,
  stopped: 0,
  granted: true,
  /** the permission prompt, held open until a test answers it */
  prompt: null as null | ((granted: boolean) => void),
  holdPrompt: false,
  /** the one recognition task: running while it listens, finishing once stopped */
  task: null as null | { state: "running" | "finishing" },
  /** the words a finishing task hands back before its `end` */
  lastWords: null as string | null,
  /** WPF-14: whether the phone can transcribe without a server, and what the last start asked for */
  onDevice: true,
  lastOptions: null as null | Record<string, unknown>,
  /** how many starts the device refuses as busy before it takes one */
  busyStarts: 0,
  /** a stopped task that never finishes */
  hangOnStop: false,
  timers: new Set<ReturnType<typeof setTimeout>>(),
  listeners: new Map<string, Set<Listener>>(),
  emit(event: string, payload: unknown = null) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload);
  },
  /** a hop on the main actor: after the JavaScript running now */
  hop(fn: () => void) {
    void Promise.resolve().then(fn);
  },
  /** the device's own time: a finishing task's words arrive after a macrotask */
  later(fn: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, 0);
    this.timers.add(timer);
  },
  /** `reset()` on whatever task is current: gone, and its `end` from a later hop */
  resetCurrent() {
    if (this.task == null) return;
    this.task = null;
    this.hop(() => this.emit("end"));
  },
  /** a microphone the device has open: a task still running (a finishing one has stopped its audio) */
  listening(): number {
    return this.task?.state === "running" ? 1 : 0;
  },
  attached(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  },
  /** the device's late words and `end` queued so far, delivered */
  idle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  },
  reset() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.started = 0;
    this.stopped = 0;
    this.granted = true;
    this.prompt = null;
    this.holdPrompt = false;
    this.task = null;
    this.lastWords = null;
    this.busyStarts = 0;
    this.onDevice = true;
    this.lastOptions = null;
    this.hangOnStop = false;
    this.listeners.clear();
  },
};

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: () =>
      mockRecogniser.holdPrompt
        ? new Promise<{ granted: boolean }>((resolve) => {
            mockRecogniser.prompt = (granted) => resolve({ granted });
          })
        : Promise.resolve({ granted: mockRecogniser.granted }),
    supportsOnDeviceRecognition: () => mockRecogniser.onDevice,
    start: (options: Record<string, unknown>) => {
      mockRecogniser.lastOptions = options;
      // `startRecognizer` resets first. A task still there — finishing after a
      // stop — is cancelled: its `end` comes from a later hop, and its handler
      // then resets whatever task is current, which is about to be this one
      if (mockRecogniser.task != null) {
        mockRecogniser.task = null;
        mockRecogniser.hop(() => mockRecogniser.emit("end"));
        mockRecogniser.hop(() => mockRecogniser.resetCurrent());
      }
      if (mockRecogniser.busyStarts > 0) {
        mockRecogniser.busyStarts -= 1;
        mockRecogniser.hop(() => {
          mockRecogniser.emit("error", { error: "busy" });
          mockRecogniser.emit("end");
        });
        return;
      }
      mockRecogniser.started += 1;
      mockRecogniser.task = { state: "running" };
      mockRecogniser.emit("start");
    },
    stop: () => {
      const task = mockRecogniser.task;
      if (task == null) {
        // nothing to finish: a reset, and an `end` all the same (:160-163)
        mockRecogniser.hop(() => mockRecogniser.emit("end"));
        return;
      }
      if (task.state !== "running") return; // stopListening's double-entry guard
      mockRecogniser.stopped += 1;
      task.state = "finishing"; // the audio stops now; the task only finishes
      if (mockRecogniser.hangOnStop) return;
      mockRecogniser.later(() => {
        // a start that cancelled it first took its words and its own `end` with it
        if (mockRecogniser.task !== task) return;
        if (mockRecogniser.lastWords != null) {
          mockRecogniser.emit("result", { isFinal: true, results: [{ transcript: mockRecogniser.lastWords }] });
        }
        mockRecogniser.resetCurrent();
      });
    },
    addListener: (event: string, listener: Listener) => {
      const set = mockRecogniser.listeners.get(event) ?? new Set<Listener>();
      mockRecogniser.listeners.set(event, set);
      set.add(listener);
      return { remove: () => set.delete(listener) };
    },
  },
}));

beforeEach(() => {
  mockRecogniser.reset();
  __resetMicForTests();
  useSessionStore.setState({ locked: false });
});

afterEach(() => {
  stopActiveMic();
  __resetMicForTests();
  useSessionStore.setState({ locked: false });
});

describe("B-4 · native dictation goes through the one microphone owner", () => {
  it("start opens exactly one recogniser, and its words reach the field's callbacks", async () => {
    const interim: string[] = [];
    const finals: string[] = [];
    const handle = await startMic({ purpose: "brain", onInterim: (t) => interim.push(t), onFinal: (t) => finals.push(t) });
    expect(handle.error).toBeNull();
    expect(mockRecogniser.started).toBe(1);
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "listening", purpose: "brain" }));

    mockRecogniser.emit("result", { isFinal: false, results: [{ transcript: "ask andy" }] });
    mockRecogniser.emit("result", { isFinal: true, results: [{ transcript: "Ask Andy for the date" }] });
    expect(interim).toEqual(["ask andy"]);
    expect(finals).toEqual(["Ask Andy for the date"]);
  });

  it("a second start stops the first recogniser: never two at once (MC-01)", async () => {
    await startMic({ purpose: "brain", onFinal: () => undefined });
    await startMic({ purpose: "journal", onFinal: () => undefined });
    expect(mockRecogniser.started).toBe(2);
    expect(mockRecogniser.listening()).toBe(1);
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "listening", purpose: "journal" }));
  });

  it("stop ends it, the state says so, and no listener outlives the session (MC-07)", async () => {
    const handle = await startMic({ purpose: "dictate", onFinal: () => undefined });
    handle.stop();
    expect(mockRecogniser.listening()).toBe(0);
    expect(useMicStore.getState().state).toBe("off");
    expect(activeMic()).toBeNull();
    // the listeners go with the device's own `end`, which arrives after the stop (B-11)
    await mockRecogniser.idle();
    expect(mockRecogniser.attached()).toBe(0);
  });

  it("a lock ends it (relock, MC-07)", async () => {
    await startMic({ purpose: "brain", onFinal: () => undefined });
    useSessionStore.getState().relock();
    expect(mockRecogniser.listening()).toBe(0);
    expect(useMicStore.getState().state).toBe("off");
  });

  it("a refused permission starts nothing and falls back to typing (MC-08)", async () => {
    mockRecogniser.granted = false;
    const states: string[] = [];
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined, onState: (s) => states.push(s) });
    expect(mockRecogniser.started).toBe(0);
    expect(states).not.toContain("listening");
    expect(states.at(-1)).toBe("error");
    expect(handle.error).toContain("typing still works");
    expect(activeMic()).toBeNull();
  });

  it("a stop taken while the permission prompt is up starts nothing when it is answered (A4R10-03's class)", async () => {
    mockRecogniser.holdPrompt = true;
    const pending = startMic({ purpose: "dictate", onFinal: () => undefined });
    expect(useMicStore.getState().state).toBe("requesting");
    stopMicFor("dictate");
    mockRecogniser.prompt?.(true);
    await pending;
    expect(mockRecogniser.started).toBe(0);
    expect(useMicStore.getState().state).toBe("off");
  });

  it("a recogniser that ends on its own leaves the microphone off, not listening", async () => {
    await startMic({ purpose: "brain", onFinal: () => undefined });
    mockRecogniser.emit("end"); // a call, Siri, the platform's own limit
    expect(useMicStore.getState().state).toBe("off");
    expect(activeMic()).toBeNull();
  });

  it("Talk on a phone hears words and sends them as text; it never asks for audio", async () => {
    const sent: string[] = [];
    const session = { state: "listening", sendText: (t: string) => sent.push(t), pushAudio: () => sent.push("(audio)") } as unknown as VoiceSession;
    const handle = await openTalkMic(session, () => false, () => true);
    expect(handle).not.toBeNull();
    expect(mockRecogniser.started).toBe(1);
    mockRecogniser.emit("result", { isFinal: true, results: [{ transcript: "What's most urgent?" }] });
    expect(sent).toEqual(["What's most urgent?"]);
  });
});

/**
 * B-11 (v2.3, QA on B-4) — a start inside the previous recognition's finishing
 * time. The device's `end` for a stopped recognition arrives late, and a start
 * before it resets the module under that recognition: its `end` then landed on
 * the new session, which released its listeners and stopped, and the cancelled
 * task's handler cancelled the new recognition — "listening", then off, with no
 * microphone. MC-01's second start, a double press and Talk's Mute then Unmute
 * all went that way.
 */
describe("B-11 · a start waits for the previous recognition's end, and keeps its microphone", () => {
  /** polls: the busy retry and the bound on the wait are real time here */
  async function until(done: () => boolean, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  it("Talk's Mute then Unmute, at once, leaves a microphone that stays open", async () => {
    const session = { state: "listening", sendText: () => undefined, pushAudio: () => undefined } as unknown as VoiceSession;
    await openTalkMic(session, () => false, () => true);
    stopMicFor("talk"); // Mute
    const handle = await openTalkMic(session, () => false, () => true); // Unmute
    await mockRecogniser.idle();
    expect(handle).not.toBeNull();
    expect(mockRecogniser.listening()).toBe(1);
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "listening", purpose: "talk" }));
  });

  it("the words a stopped recognition hands back reach its own field, never the next one's", async () => {
    const brain: string[] = [];
    const journal: string[] = [];
    mockRecogniser.lastWords = "for the date";
    await startMic({ purpose: "brain", onFinal: (t) => brain.push(t) });
    await startMic({ purpose: "journal", onFinal: (t) => journal.push(t) });
    await mockRecogniser.idle();
    expect(brain).toEqual(["for the date"]);
    expect(journal).toEqual([]);
  });

  it("a device still busy with an earlier recognition is waited for, not reported as a failure", async () => {
    mockRecogniser.busyStarts = 1;
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    await until(() => mockRecogniser.listening() === 1);
    expect(handle.error).toBeNull();
    expect(useMicStore.getState()).toEqual(expect.objectContaining({ state: "listening", purpose: "brain", error: null }));
  });

  it("a recognition that never ends holds the next start only as long as the wait allows", async () => {
    mockRecogniser.hangOnStop = true;
    await startMic({ purpose: "brain", onFinal: () => undefined });
    const next = startMic({ purpose: "journal", onFinal: () => undefined });
    await until(() => mockRecogniser.started === 2);
    await next;
    expect(mockRecogniser.started).toBe(2);
    expect(useMicStore.getState().state).not.toBe("requesting");
  });

  it("a recogniser the device has switched off says the microphone is unavailable, not that permission is needed", async () => {
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    mockRecogniser.emit("error", { error: "service-not-allowed" }); // Siri and Dictation off, or the language's assets missing
    expect(useMicStore.getState().state).toBe("error");
    expect(handle.error).toContain("type instead");
    expect(handle.error).not.toContain("permission");
  });
});

/**
 * v2.3 WPF-14 — the permission strings promise that transcription happens on this device
 * and nothing leaves the phone (`app.json`). The recogniser was started without
 * `requiresOnDeviceRecognition`, which defaults to false, so the words could be
 * transcribed on a server; and on iOS the module applies the flag only where the
 * recogniser supports it, so the app has to ask.
 */
describe("WPF-14 · dictation stays on the phone, or does not start", () => {
  it("the device's recogniser is asked to transcribe on the device", async () => {
    await startMic({ purpose: "brain", onFinal: () => undefined });
    expect(mockRecogniser.lastOptions).toEqual(expect.objectContaining({ requiresOnDeviceRecognition: true }));
  });

  it("a phone that cannot transcribe on the device is told to type, and nothing is started", async () => {
    mockRecogniser.onDevice = false;
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    expect(mockRecogniser.started).toBe(0);
    expect(useMicStore.getState().state).toBe("error");
    expect(handle.error).toContain("type instead");
    expect(handle.error).toContain("on-device");
  });
});
