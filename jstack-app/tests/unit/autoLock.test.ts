/**
 * LK-01 — two device classes, one timer (ADR-41, L-1).
 *
 * The old rule was one rule for everybody: two minutes of inactivity, and any
 * hide locks at once. On a laptop that is a lock screen every time you look at
 * another window, which is what Josh actually complained about; on a phone the
 * ten-minute window the fix implies is a stolen phone that is still open.
 *
 * So: a touch device locks the moment it is put down, and a desktop locks
 * after `lock.afterMinutes` with the timer counting THROUGH the time the tab
 * was hidden. The second half is the part a careless implementation gets
 * wrong — re-arming on the way back means ten minutes away and thirty seconds
 * back never locks at all.
 */
import { Platform } from "react-native";
import { useSessionStore } from "@/stores/session";
import { useParametersStore } from "@/stores/parameters";
import { defaultParameters } from "@/data/parameters";
import { installAutoLock, isTouchClass, lockAfterMs, useAutoLockStore } from "@/lib/autoLock";
import { useMicStore } from "@/stores/mic";

const ORIGINAL_OS = Platform.OS;
const MINUTE = 60_000;

/** the browser bits `installAutoLock` listens to, none of which exist in the
 * unit lane (Platform.OS "ios", no `document`) — so the web path is driven
 * over a stub we can fire events into. */
type Listener = (e?: unknown) => void;
type Globals = Record<string, unknown>;
let listeners: Record<string, Listener[]>;
let relock: jest.SpyInstance;
/** what we CREATED, so `afterEach` can put the environment back exactly */
let created: string[] = [];

/**
 * Create `globalThis.<name>` if this runtime has no such thing, and hand back
 * the object either way. Nothing is assumed: `navigator` and `window` exist in
 * the local jest-expo lane and `navigator` does NOT on the CI runner, which is
 * a difference a test that only ran locally would have shipped green and
 * discovered on the board (it did, once — that is why this function exists).
 */
function ensureGlobal(name: "navigator" | "window"): Globals {
  const g = globalThis as unknown as Globals;
  if (typeof g[name] !== "object" || g[name] == null) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: {} });
    created.push(name);
  }
  return g[name] as Globals;
}

function stubBrowser(opts: { touchPoints: number; width: number }): void {
  listeners = {};
  const add = (type: string, fn: Listener) => {
    (listeners[type] ??= []).push(fn);
  };
  const remove = (type: string, fn: Listener) => {
    listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
  };
  Platform.OS = "web";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { visibilityState: "visible", addEventListener: add, removeEventListener: remove },
  });
  created.push("document");

  // properties on the objects, never a replacement OF them: other things in
  // this file's module graph hold references to the real `window`
  const nav = ensureGlobal("navigator");
  Object.defineProperty(nav, "maxTouchPoints", { configurable: true, value: opts.touchPoints });
  const win = ensureGlobal("window");
  Object.defineProperty(win, "innerWidth", { configurable: true, value: opts.width });
  win.addEventListener = add;
  win.removeEventListener = remove;
}

function fire(type: string, visibility?: "hidden" | "visible"): void {
  if (visibility != null) (globalThis.document as unknown as { visibilityState: string }).visibilityState = visibility;
  for (const fn of listeners[type] ?? []) fn();
}

beforeEach(() => {
  jest.useFakeTimers();
  relock = jest.spyOn(useSessionStore.getState(), "relock").mockImplementation(() => {});
  useParametersStore.setState({ parameters: defaultParameters() });
  useAutoLockStore.setState({ overrideMs: null, shielded: false });
});

afterEach(() => {
  jest.useRealTimers();
  relock.mockRestore();
  useMicStore.getState().clear();
  Platform.OS = ORIGINAL_OS;
  for (const name of created) Reflect.deleteProperty(globalThis, name);
  created = [];
});

describe("LK-01 · which device is this", () => {
  it("native is always touch — there is no such thing as a desktop phone", () => {
    Platform.OS = "ios";
    expect(isTouchClass()).toBe(true);
  });

  it("a web browser with no touch points is a desktop", () => {
    stubBrowser({ touchPoints: 0, width: 1366 });
    expect(isTouchClass()).toBe(false);
  });

  it("a narrow browser with touch points is a phone", () => {
    stubBrowser({ touchPoints: 5, width: 393 });
    expect(isTouchClass()).toBe(true);
  });

  it("a WIDE browser with touch points is a touch-screen laptop, and laptops do not lock on a tab switch", () => {
    stubBrowser({ touchPoints: 10, width: 1366 });
    expect(isTouchClass()).toBe(false);
  });
});

describe("LK-01 · the timeout is the parameter", () => {
  it("ten minutes by default, in milliseconds", () => {
    expect(lockAfterMs()).toBe(10 * MINUTE);
  });

  it("follows the parameter Josh sets", () => {
    useParametersStore.setState({ parameters: defaultParameters().map((p) => (p.key === "lock.afterMinutes" ? { ...p, value: 30 } : p)) });
    expect(lockAfterMs()).toBe(30 * MINUTE);
  });

  it("the test rig's override wins over both, and is the ONLY thing that can be under a minute", () => {
    useAutoLockStore.getState().setTimeoutMs(300);
    expect(lockAfterMs()).toBe(300);
  });
});

describe("LK-01 · a desktop locks on the clock, not on the tab", () => {
  beforeEach(() => stubBrowser({ touchPoints: 0, width: 1366 }));

  it("hiding the tab does not lock it", () => {
    const stop = installAutoLock();
    fire("visibilitychange", "hidden");
    expect(relock).not.toHaveBeenCalled();
    stop();
  });

  /** The acceptance test's own numbers: hidden at 9, back at 9.5, locked at 10. */
  it("the timer counts THROUGH the hidden time — 9 min away, back at 9.5, locked at 10", () => {
    const stop = installAutoLock();

    jest.advanceTimersByTime(9 * MINUTE);
    fire("visibilitychange", "hidden");
    jest.advanceTimersByTime(0.5 * MINUTE);
    fire("visibilitychange", "visible");
    expect(relock).not.toHaveBeenCalled();

    // 9.5 elapsed; half a minute later the ten minutes are up
    jest.advanceTimersByTime(0.5 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("real interaction re-arms it — that is what 'inactivity' means", () => {
    const stop = installAutoLock();
    jest.advanceTimersByTime(9 * MINUTE);
    fire("pointerdown");
    jest.advanceTimersByTime(9 * MINUTE);
    expect(relock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a shorter parameter re-arms the running timer rather than waiting out the old one", () => {
    const stop = installAutoLock();
    jest.advanceTimersByTime(2 * MINUTE);
    useParametersStore.setState({ parameters: defaultParameters().map((p) => (p.key === "lock.afterMinutes" ? { ...p, value: 1 } : p)) });
    jest.advanceTimersByTime(1 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stopping removes the listeners, so a second install does not double-lock", () => {
    installAutoLock()();
    fire("visibilitychange", "hidden");
    jest.advanceTimersByTime(20 * MINUTE);
    expect(relock).not.toHaveBeenCalled();
  });
});

describe("LK-01 · a phone locks the moment it is put down", () => {
  beforeEach(() => stubBrowser({ touchPoints: 5, width: 393 }));

  it("hiding locks at once", () => {
    const stop = installAutoLock();
    fire("visibilitychange", "hidden");
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("with `lock.lockOnHideTouch` off it behaves like a desktop, and the timer still applies", () => {
    useParametersStore.setState({ parameters: defaultParameters().map((p) => (p.key === "lock.lockOnHideTouch" ? { ...p, value: false } : p)) });
    const stop = installAutoLock();
    fire("visibilitychange", "hidden");
    expect(relock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("the inactivity timer applies while it is visible too", () => {
    const stop = installAutoLock();
    jest.advanceTimersByTime(10 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });
});

/**
 * v2.3.1 WPJ-2 — Josh, 15 Sep: "When talk / dictation is on — the app and phone/ipad/app should ensure the
 * device remains open and screen on." A person speaking is not idle: JSTACK's own inactivity lock waits while a
 * microphone is open, and counts a fresh window from the moment the session ends. Hold-to-lock, the emergency
 * lock and a phone put down still lock at once (P-1), and each of those ends the microphone through relock()
 * (MC-07, `tests/unit/mic.test.ts`).
 */
describe("WPJ-2 · the inactivity lock waits while a microphone is open", () => {
  it("a desktop: a session open past the timeout does not lock, and the window starts again when it ends", () => {
    stubBrowser({ touchPoints: 0, width: 1366 });
    const stop = installAutoLock();
    useMicStore.getState().set("listening", "talk");
    jest.advanceTimersByTime(25 * MINUTE);
    expect(relock).not.toHaveBeenCalled();

    useMicStore.getState().set("off", "talk");
    jest.advanceTimersByTime(9 * MINUTE);
    expect(relock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a phone on screen: a session begun late in the window does not lock, and the window starts again when it ends", () => {
    stubBrowser({ touchPoints: 5, width: 393 });
    const stop = installAutoLock();
    jest.advanceTimersByTime(9 * MINUTE);
    useMicStore.getState().set("listening", "talk");
    jest.advanceTimersByTime(15 * MINUTE);
    expect(relock).not.toHaveBeenCalled();

    useMicStore.getState().set("off", "talk");
    jest.advanceTimersByTime(9 * MINUTE);
    expect(relock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1 * MINUTE);
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("the permission prompt counts as open: a session still asking is not idle either", () => {
    stubBrowser({ touchPoints: 0, width: 1366 });
    const stop = installAutoLock();
    useMicStore.getState().set("requesting", "talk");
    jest.advanceTimersByTime(12 * MINUTE);
    expect(relock).not.toHaveBeenCalled();
    stop();
  });

  it("a phone put down still locks at once with a microphone open (P-1)", () => {
    stubBrowser({ touchPoints: 5, width: 393 });
    const stop = installAutoLock();
    useMicStore.getState().set("listening", "talk");
    fire("visibilitychange", "hidden");
    expect(relock).toHaveBeenCalledTimes(1);
    stop();
  });
});
