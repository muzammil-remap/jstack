/**
 * Keyboard listeners (spec §14.2 — KB-01/02/03).
 * Native: RN Keyboard events carry the keyboard height.
 * Web: the visualViewport shrinks when a soft keyboard appears — the delta
 * is the inset. Both paths write stores/ui.ts's keyboard band (ADR-04);
 * it lived in stores/session.ts until E-1 moved it.
 *
 * E-1 also publishes `visualViewport.offsetTop`. The inset says how much of
 * the window the keyboard took; the offset says where what is left BEGINS.
 * On iOS the two are independent: Safari scrolls the layout viewport up under
 * the keyboard, so a field can be sized correctly for the band and still be
 * drawn above it. `Field` needs both to put the expanded editor inside the
 * band a person can actually see (TE-02), which is why they are one fact in
 * one store rather than a height here and an offset somewhere else.
 */
import { Keyboard, Platform } from "react-native";
import { useUiStore } from "@/stores/ui";

type VisualViewport = {
  height: number;
  offsetTop: number;
  addEventListener: (t: string, cb: () => void) => void;
  removeEventListener: (t: string, cb: () => void) => void;
};

export function installKeyboardListeners(): () => void {
  const set = (px: number) => useUiStore.getState().setKeyboardInset(px);
  const setTop = (px: number) => useUiStore.getState().setKeyboardOffsetTop(px);

  if (Platform.OS !== "web") {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvent, (e) => set(e.endCoordinates?.height ?? 0));
    const s2 = Keyboard.addListener(hideEvent, () => set(0));
    return () => {
      s1.remove();
      s2.remove();
    };
  }

  const vv = (globalThis as { visualViewport?: VisualViewport }).visualViewport;
  if (!vv) return () => {};
  const onChange = () => {
    const delta = window.innerHeight - vv.height;
    // small deltas are browser chrome, not a keyboard
    set(delta > 60 ? delta : 0);
    setTop(vv.offsetTop ?? 0);
  };
  // `scroll` as well as `resize`: the keyboard's arrival resizes the visual
  // viewport, but iOS scrolling it up under the keyboard afterwards only
  // fires scroll — and that is precisely when offsetTop changes.
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
  };
}

/**
 * v2.3.2 WPR-4 (b): how far above the layout viewport's bottom the visual viewport now ends — the top of the
 * keyboard while it is up, 0 otherwise. Bottom chrome (the tab bar, the orb) rides there, so nothing is fixed to a
 * window bottom the keyboard has covered.
 */
export function useKeyboardBottom(): number {
  return useUiStore((s) => Math.max(0, s.keyboardInset - s.keyboardOffsetTop));
}

/**
 * v2.3.2 WPR-4 (c): after Enter or a blur the page goes back to the top. iOS scrolls the layout viewport up under the
 * keyboard and can leave it there once the keyboard has gone — Josh's "the screen stays zoomed in, cropping the view".
 * The band itself is left to the visual viewport's own events above: rewriting it at a blur moved the button beside a
 * field out from under a press still in flight.
 */
export function resetPageScroll(): void {
  if (Platform.OS !== "web") return;
  (globalThis as { scrollTo?: (x: number, y: number) => void }).scrollTo?.(0, 0);
}

/** Dismiss the keyboard (native) / blur the focused input (web). */
export function dismissKeyboard(): void {
  if (Platform.OS === "web") {
    const el = (globalThis as { document?: { activeElement?: { blur?: () => void } } }).document?.activeElement;
    el?.blur?.();
    useUiStore.getState().setKeyboardInset(0);
    useUiStore.getState().setKeyboardOffsetTop(0);
  } else {
    Keyboard.dismiss();
  }
}
