/**
 * Auto-lock (spec §14.9 — SEC-03; rewritten by L-1 under ADR-41).
 *
 * ONE rule used to serve both device classes: two minutes of inactivity, and
 * any hide locks at once. On a laptop that is a passkey prompt every time you
 * glance at another window — Josh: "returns to lock screen waaay too quickly"
 * — and simply lengthening it would leave a phone that is picked up off a desk
 * unlocked for ten minutes. They are different questions, so they get
 * different answers:
 *
 * - **Touch** (a phone or tablet): leaving the app or locking the screen locks
 *   JSTACK at once, behind `lock.lockOnHideTouch`. The inactivity timer
 *   applies as well, while it is visible.
 * - **Desktop**: hiding the tab does nothing at all, and the inactivity timer
 *   keeps counting WHILE HIDDEN. Ten minutes away locks; thirty seconds at
 *   another window does not. Re-arming on the way back would mean a tab
 *   switched away from every nine minutes never locks, which is the bug this
 *   shape exists to avoid.
 *
 * A touch-screen laptop is a desktop (`maxTouchPoints > 0` is not enough — the
 * viewport has to be a phone's as well), because the thing being protected
 * against is a device left somewhere, not a screen you can poke.
 *
 * Emergency lock, `session.revoked` and refresh-token reuse still lock
 * immediately everywhere, from `stores/session.ts` — none of that is here,
 * and LK-05 asserts the parameter cannot switch it off. Any other `401` does
 * not lock yet: that relock is REMAP's, with the token refresh (WPF-13).
 */
import { AppState, Platform } from "react-native";
import { create } from "zustand";
import { currentParameter, useParametersStore } from "@/stores/parameters";
import { useSessionStore } from "@/stores/session";
import { micIsOpen, useMicStore } from "@/stores/mic";

type AutoLockState = {
  /**
   * The test rig's override in milliseconds (`__JSTACK__.setAutoLockMs`), or
   * null for "use the parameter". A rig lever rather than a second source of
   * truth: `lock.afterMinutes` has a one-minute floor and an e2e cannot wait
   * a minute, so the override is the only way to a 300 ms timer — and being
   * `null` by default, it cannot quietly become the real setting.
   */
  overrideMs: number | null;
  /** true while the app is backgrounded (drives the privacy shield) */
  shielded: boolean;
  setTimeoutMs: (ms: number) => void;
  setShielded: (v: boolean) => void;
};

export const useAutoLockStore = create<AutoLockState>((set) => ({
  overrideMs: null,
  shielded: false,
  setTimeoutMs: (overrideMs) => set({ overrideMs }),
  setShielded: (shielded) => set({ shielded }),
}));

/** the phone/tablet class — always true off the web, and on the web only when
 *  the device both takes touch AND is the size of one (a touch laptop is a
 *  desktop, ADR-41). */
export function isTouchClass(): boolean {
  if (Platform.OS !== "web") return true;
  const touchPoints = typeof navigator === "undefined" ? 0 : (navigator.maxTouchPoints ?? 0);
  const width = typeof window === "undefined" ? 0 : window.innerWidth;
  return touchPoints > 0 && width < 1180;
}

/** the inactivity window in ms: the rig's override, else `lock.afterMinutes`. */
export function lockAfterMs(): number {
  const override = useAutoLockStore.getState().overrideMs;
  if (override != null) return override;
  return (currentParameter("lock.afterMinutes") as number) * 60_000;
}

export function installAutoLock(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    // v2.3.1 WPJ-2 (Josh, 15 Sep): a person speaking is not idle. While a microphone is open the timer holds,
    // and a fresh window starts the moment the session ends (the subscription below)
    if (micIsOpen(useMicStore.getState())) return;
    timer = setTimeout(() => {
      useSessionStore.getState().relock(); // idle past `lock.afterMinutes` (SEC-03)
    }, lockAfterMs());
  };
  arm();

  /** the immediate lock, and the one parameter that can switch it off */
  const locksOnHide = () => isTouchClass() && currentParameter("lock.lockOnHideTouch") === true;

  const cleanups: (() => void)[] = [() => timer && clearTimeout(timer)];

  if (Platform.OS === "web") {
    const activity = () => arm();
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"] as const) {
      window.addEventListener(ev, activity, { passive: true });
      cleanups.push(() => window.removeEventListener(ev, activity));
    }
    const onVisibility = () => {
      // Nothing on the way back. The timer that was running keeps running —
      // that is what "the timer counts while hidden" means, and re-arming
      // here is exactly how a tab you check every nine minutes stays open
      // forever (LK-01).
      if (document.visibilityState === "hidden" && locksOnHide()) {
        useSessionStore.getState().relock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
  } else {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // the shield comes down; the timer is NOT re-armed, for the reason above
        useAutoLockStore.getState().setShielded(false);
      } else {
        // shield BEFORE the app-switcher snapshot, whatever the lock rule is:
        // SEC-04 is about the thumbnail, not about the passkey
        useAutoLockStore.getState().setShielded(true);
        if (locksOnHide()) useSessionStore.getState().relock();
      }
    });
    cleanups.push(() => sub.remove());
  }

  // re-arm when the window changes under it: the rig shortening it, or Josh
  // setting `lock.afterMinutes` in Settings › Security
  const unsubOverride = useAutoLockStore.subscribe((s, prev) => {
    if (s.overrideMs !== prev.overrideMs) arm();
  });
  const unsubParameter = useParametersStore.subscribe((s, prev) => {
    if (s.parameters !== prev.parameters) arm();
  });
  // WPJ-2: a session opening holds the timer, and its end starts a fresh window
  const unsubMic = useMicStore.subscribe((s, prev) => {
    if (micIsOpen(s) !== micIsOpen(prev)) arm();
  });
  cleanups.push(unsubOverride, unsubParameter, unsubMic);

  return () => cleanups.forEach((fn) => fn());
}
