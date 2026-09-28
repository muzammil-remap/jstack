/**
 * v2.3.1 WPJ-1 — while a microphone is open the screen stays on (in a browser).
 *
 * Josh, 15 Sep: "When talk / dictation is on — the app and phone/ipad/app should ensure the device remains
 * open and screen on." `lib/mic.ts`, the one owner, holds the screen awake for the life of each session and
 * gives it back on every way a session ends. In a browser that is the Screen Wake Lock API where it exists,
 * and nothing where it does not. The API is faked and counted — one entry per lock the browser handed out,
 * true once it was released — so a lock taken twice, or kept after the end, shows as a count.
 *
 * B-17's rule, as in `mic.test.ts`: the browser globals are created here, never assumed.
 */
import { Platform } from "react-native";
import { activeMic, startMic, stopActiveMic, stopMicFor, __resetMicForTests } from "@/lib/mic";
import { holdScreenAwake, releaseScreenAwake } from "@/lib/wakeLock";
import { useMicStore } from "@/stores/mic";

type Handle = Awaited<ReturnType<typeof startMic>>;
type FakeRecogniser = { onerror: ((ev: { error: string }) => void) | null };

const g = globalThis as unknown as Record<string, unknown>;
const KEYS = ["navigator", "MediaRecorder", "SpeechRecognition", "webkitSpeechRecognition"];
const saved: Record<string, unknown> = {};
const ORIGINAL_OS = Platform.OS;

/** one entry per lock the browser handed out; true once it was released */
let locks: boolean[] = [];
/** every recogniser a session opened, the latest last */
const recognisers: FakeRecogniser[] = [];

function installBrowser(opts: { wakeLock?: boolean; refuse?: boolean } = {}): void {
  locks = [];
  recognisers.length = 0;
  const navigator: Record<string, unknown> = {
    mediaDevices: {
      getUserMedia: () =>
        opts.refuse
          ? Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }))
          : Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
    },
  };
  if (opts.wakeLock !== false) {
    navigator.wakeLock = {
      request: (type: string) => {
        if (type !== "screen") throw new Error(`asked for a ${type} lock`);
        const i = locks.push(false) - 1;
        return Promise.resolve({
          release: () => {
            locks[i] = true;
            return Promise.resolve();
          },
        });
      },
    };
  }
  g.navigator = navigator;
  delete g.MediaRecorder;
  delete g.webkitSpeechRecognition;
  g.SpeechRecognition = class {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: unknown = null;
    onerror: FakeRecogniser["onerror"] = null;
    constructor() {
      recognisers.push(this);
    }
    start() {}
    stop() {}
  };
}

/** the browser answers a wake-lock request after the JavaScript running now */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
const held = () => locks.filter((released) => !released).length;

beforeEach(() => {
  for (const k of KEYS) saved[k] = g[k];
  Platform.OS = "web";
  __resetMicForTests();
});

afterEach(async () => {
  stopActiveMic();
  __resetMicForTests();
  await settle();
  Platform.OS = ORIGINAL_OS;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete g[k];
    else g[k] = saved[k];
  }
});

describe("WPJ-1 · while a microphone is open the screen stays on, and every way a session ends gives it back (browser)", () => {
  it("a session takes one wake lock from its start, and words heard do not take another", async () => {
    installBrowser();
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    await settle();
    expect(useMicStore.getState().state).toBe("listening");
    handle.heard();
    handle.heard();
    await settle();
    expect(locks).toEqual([false]);
  });

  it.each<[string, (h: Handle) => void]>([
    ["Stop", (h) => h.stop()],
    ["a lock — stopActiveMic(), which relock() calls", () => stopActiveMic()],
    ["Talk's End and Mute — stopMicFor(purpose)", () => stopMicFor("brain")],
    ["the recogniser giving up on a silence", () => recognisers.at(-1)?.onerror?.({ error: "no-speech" })],
    ["a recogniser error", () => recognisers.at(-1)?.onerror?.({ error: "network" })],
  ])("%s gives the wake lock back", async (_path, end) => {
    installBrowser();
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    await settle();
    expect(locks).toEqual([false]);
    end(handle);
    await settle();
    expect(locks).toEqual([true]);
    expect(activeMic()).toBeNull();
  });

  it("the auto-stop after a silence gives the wake lock back", async () => {
    jest.useFakeTimers();
    try {
      installBrowser();
      await startMic({ purpose: "brain", autoStopSeconds: 30, onFinal: () => undefined });
      await settle();
      expect(locks).toEqual([false]);
      jest.advanceTimersByTime(31_000);
      await settle();
      expect(locks).toEqual([true]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a refused permission gives back the lock the press took, even one the browser grants after the refusal", async () => {
    installBrowser({ refuse: true });
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    await settle();
    expect(handle.error).toContain("permission");
    expect(locks).toEqual([true]);
  });

  it("a second start gives back the first session's lock, and the second holds its own (MC-01)", async () => {
    installBrowser();
    await startMic({ purpose: "brain", onFinal: () => undefined });
    await settle();
    await startMic({ purpose: "journal", onFinal: () => undefined });
    await settle();
    expect(locks).toEqual([true, false]);
  });

  it("car mode's hold outlives the microphone's: each holder gives back only its own (VP-07)", async () => {
    installBrowser();
    holdScreenAwake("car-mode");
    await settle();
    const handle = await startMic({ purpose: "talk", onFinal: () => undefined });
    await settle();
    handle.stop();
    await settle();
    expect(held()).toBe(1);
    releaseScreenAwake("car-mode");
    await settle();
    expect(held()).toBe(0);
  });

  it("a browser with no wake lock still opens the microphone, and asks for nothing", async () => {
    installBrowser({ wakeLock: false });
    const handle = await startMic({ purpose: "brain", onFinal: () => undefined });
    await settle();
    expect(handle.error).toBeNull();
    expect(useMicStore.getState().state).toBe("listening");
    handle.stop();
    await settle();
    expect(locks).toEqual([]);
  });
});
