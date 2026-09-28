/**
 * v2.3.1 WPJ-1 — while a microphone is open the screen stays on (on a phone).
 *
 * On a phone the one owner (`lib/mic.ts`) holds `expo-keep-awake` under its own tag for the life of each
 * recognition session, and every way a session ends deactivates it. The package is 15.0.8, declared at WPJ-1:
 * it was already installed as expo's own dependency, so nothing new is on disk. Both modules are mocked — this
 * lane has no screen and no microphone — so what this proves is the wiring. The recogniser mock is the small
 * one: `micNative.test.ts` models B-11's late `end` in full; here only the ways a session ends matter.
 */
import { AppState } from "react-native";
import { activeMic, startMic, stopMicFor, __resetMicForTests } from "@/lib/mic";
import { useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";

type Listener = (event: unknown) => void;
type Handle = Awaited<ReturnType<typeof startMic>>;

/** every keep-awake call, in order: ["on" | "off", tag] */
const mockKeepAwake = { calls: [] as [string, string][] };
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (tag: string) => {
    mockKeepAwake.calls.push(["on", tag]);
    return Promise.resolve();
  },
  deactivateKeepAwake: (tag: string) => {
    mockKeepAwake.calls.push(["off", tag]);
    return Promise.resolve();
  },
}));

const mockDevice = {
  granted: true,
  holdPrompt: false,
  /** the permission prompt, held open until a test answers it */
  prompt: null as null | ((granted: boolean) => void),
  running: false,
  listeners: new Map<string, Set<Listener>>(),
  emit(event: string, payload: unknown = null) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload);
  },
  reset() {
    this.granted = true;
    this.holdPrompt = false;
    this.prompt = null;
    this.running = false;
    this.listeners.clear();
  },
};
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: () =>
      mockDevice.holdPrompt
        ? new Promise<{ granted: boolean }>((resolve) => {
            mockDevice.prompt = (granted) => resolve({ granted });
          })
        : Promise.resolve({ granted: mockDevice.granted }),
    supportsOnDeviceRecognition: () => true,
    start: () => {
      mockDevice.running = true;
      mockDevice.emit("start");
    },
    // the device finishes a stopped recognition and says `end` a moment later (B-11)
    stop: () => {
      if (!mockDevice.running) return;
      mockDevice.running = false;
      setTimeout(() => mockDevice.emit("end"), 0);
    },
    addListener: (event: string, listener: Listener) => {
      const set = mockDevice.listeners.get(event) ?? new Set<Listener>();
      mockDevice.listeners.set(event, set);
      set.add(listener);
      return { remove: () => set.delete(listener) };
    },
  },
}));

const TAG = "jstack-mic";
/** the device's late `end`, delivered */
const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

beforeEach(() => {
  mockDevice.reset();
  mockKeepAwake.calls = [];
  __resetMicForTests();
  useSessionStore.setState({ locked: false });
});

afterEach(async () => {
  activeMic()?.stop();
  await idle();
  __resetMicForTests();
  useSessionStore.setState({ locked: false });
});

describe("WPJ-1 · on a phone, expo-keep-awake holds the screen while a session is open", () => {
  it("a session activates it once, under the owner's tag", async () => {
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    expect(handle.error).toBeNull();
    expect(mockDevice.running).toBe(true);
    expect(mockKeepAwake.calls).toEqual([["on", TAG]]);
  });

  it.each<[string, (h: Handle) => void]>([
    ["Stop", (h) => h.stop()],
    ["a lock (relock)", () => useSessionStore.getState().relock()],
    ["Talk's End and Mute — stopMicFor(purpose)", () => stopMicFor("brain")],
    ["the recogniser ending on its own", () => mockDevice.emit("end")],
    ["a recogniser error", () => mockDevice.emit("error", { error: "network" })],
    ["a second start", () => void startMic({ purpose: "journal", onFinal: () => undefined })],
  ])("%s deactivates it", async (_path, end) => {
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    end(handle);
    await idle();
    expect(mockKeepAwake.calls.slice(0, 2)).toEqual([
      ["on", TAG],
      ["off", TAG],
    ]);
  });

  it("a refused permission, and a stop taken at the prompt, each give back what the press took", async () => {
    mockDevice.granted = false;
    const refused = await startMic({ purpose: "brain", onFinal: () => undefined });
    expect(refused.error).toContain("permission");
    expect(mockKeepAwake.calls).toEqual([
      ["on", TAG],
      ["off", TAG],
    ]);

    mockKeepAwake.calls = [];
    mockDevice.granted = true;
    mockDevice.holdPrompt = true;
    const pending = startMic({ purpose: "dictate", onFinal: () => undefined });
    stopMicFor("dictate");
    mockDevice.prompt?.(true);
    await pending;
    expect(mockDevice.running).toBe(false);
    expect(mockKeepAwake.calls).toEqual([
      ["on", TAG],
      ["off", TAG],
    ]);
  });
});

/**
 * v2.3.1 WPJ-3 — Josh, 15 Sep: "If I lock the device, voice locks too." The device locking or the app switching away
 * (`AppState` "background") ends the session the way a pause does: the words already heard stay where they went, the
 * screen is given back, and nothing reopens on the way back. "inactive" is not leaving: iOS passes through it for a
 * permission prompt or Control Center, and the session that asked must survive its own prompt.
 */
describe("WPJ-3 · the device locking or the app switching away ends the session the way a pause does", () => {
  const appState = AppState.addEventListener as unknown as jest.Mock;
  const watchers = new Set<(state: string) => void>();
  const move = (state: string) => [...watchers].forEach((watch) => watch(state));

  beforeEach(() => {
    watchers.clear();
    appState.mockImplementation((_type: string, watch: (state: string) => void) => {
      watchers.add(watch);
      return { remove: () => watchers.delete(watch) };
    });
  });

  afterEach(() => {
    appState.mockImplementation(() => ({ remove: jest.fn() }));
  });

  it("background: the session ends, the words already heard stay, keep-awake goes back, and nothing reopens on return", async () => {
    const finals: string[] = [];
    const handle = await startMic({ purpose: "brain", onFinal: (text) => finals.push(text) });
    mockDevice.emit("result", { isFinal: true, results: [{ transcript: "Ask Andy for the date" }] });
    move("background");
    await idle();
    expect(handle.error).toBeNull();
    expect(mockDevice.running).toBe(false);
    expect(activeMic()).toBeNull();
    expect(useMicStore.getState().state).toBe("off");
    expect(finals).toEqual(["Ask Andy for the date"]);
    expect(mockKeepAwake.calls).toEqual([
      ["on", TAG],
      ["off", TAG],
    ]);
    expect(watchers.size).toBe(0);

    move("active");
    await idle();
    expect(mockDevice.running).toBe(false);
    expect(activeMic()).toBeNull();
  });

  it("inactive — a permission prompt, Control Center — does not end it", async () => {
    await startMic({ purpose: "brain", onFinal: () => undefined });
    move("inactive");
    await idle();
    expect(mockDevice.running).toBe(true);
    expect(useMicStore.getState().state).toBe("listening");
  });
});
