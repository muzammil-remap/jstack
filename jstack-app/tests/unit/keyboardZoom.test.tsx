/**
 * v2.3.2 WPR-4 — Josh, 16 Sep, on his iPhone, on the mock built that morning: "the screen zoom still not right when I click to
 * enter text in brain. Doesn't share the screen correctly with my keyboard. Fix that. Find field same issue. When I
 * click enter, the screen stays zoomed in, cropping the view."
 *
 * At the root: iOS zooms any field under 16 px on focus, whatever the viewport meta says in some browsers, so every
 * text input on the web renders at 16 px or more; the bottom chrome (the tab bar, the orb) follows the visual viewport
 * while the keyboard is up; and a submit or a blur scrolls the page back to the top, so nothing stays cropped. What
 * only a real phone can prove — the OS keyboard itself — is a DEVICE_RUNBOOK.md line. The web branch is under test,
 * so `Platform.OS` is set here as `tests/unit/micAwake.test.ts` sets it.
 */
import React from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Platform, StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Orb } from "@/components/chrome/Orb";
import { TabBar } from "@/components/chrome/TabBar";
import { installKeyboardListeners } from "@/lib/keyboard";
import { reset as resetDb } from "@/data/mock/db";
import { useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import { Field } from "@/theme/ui";

const app = join(__dirname, "..", "..");
const g = globalThis as Record<string, unknown>;
const ORIGINAL_OS = Platform.OS;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  for (const k of ["visualViewport", "window", "scrollTo"]) saved[k] = g[k];
  resetDb();
  useSessionStore.setState({ modal: null, sheet: null, settingsOpen: false, toast: null });
  useMicStore.getState().clear();
  useUiStore.getState().setKeyboardInset(0);
  useUiStore.getState().setKeyboardOffsetTop(0);
  useUiStore.setState({ editorExpanded: false });
});

afterEach(() => {
  jest.useRealTimers();
  Platform.OS = ORIGINAL_OS;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete g[k];
    else g[k] = v;
  }
  useUiStore.getState().setKeyboardInset(0);
  useUiStore.getState().setKeyboardOffsetTop(0);
  useUiStore.setState({ editorExpanded: false });
  jest.restoreAllMocks();
});

/** a window whose scrollTo is counted, as a browser's would be */
function countScrolls(): jest.Mock {
  const scrollTo = jest.fn();
  g.window = Object.assign((g.window as object | undefined) ?? {}, { scrollTo, innerHeight: 844 });
  g.scrollTo = scrollTo;
  return scrollTo;
}

const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

describe("WPR-4 · the keyboard shares the screen: no focus zoom, chrome that follows it, and no crop after Enter", () => {
  it("every text input in the app is the one Field renders, so the size rule below covers them all", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        // a JSX tag, not the type in `useRef<TextInput | null>`
        else if (/\.tsx$/.test(name) && /(^|[\s({])<TextInput[\s/>]/m.test(readFileSync(p, "utf8"))) found.push(p.slice(app.length + 1).split("\\").join("/"));
      }
    };
    for (const d of ["app", "components", "layout", "theme"]) walk(join(app, d));
    expect(found).toEqual(["theme/ui/fields.tsx"]);
  });

  it("on the web a Field's input renders at 16 px or more — iOS zooms any smaller field on focus", () => {
    Platform.OS = "web";
    const { getByTestId } = render(<Field testID="probe" value="" onChangeText={() => {}} placeholder="Find" />);
    const size = Number(flat(getByTestId("probe").props.style).fontSize);
    expect(size).toBeGreaterThanOrEqual(16);
  });

  it("the visual viewport's resize and scroll are what the keyboard band is read from (the subscription stays)", () => {
    const listeners: Record<string, () => void> = {};
    const vv = { height: 844, offsetTop: 0, addEventListener: (t: string, cb: () => void) => (listeners[t] = cb), removeEventListener: jest.fn() };
    Platform.OS = "web";
    g.window = Object.assign((g.window as object | undefined) ?? {}, { innerHeight: 844 });
    g.visualViewport = vv;
    const stop = installKeyboardListeners();
    vv.height = 500;
    vv.offsetTop = 40;
    listeners.resize();
    expect({ inset: useUiStore.getState().keyboardInset, top: useUiStore.getState().keyboardOffsetTop }).toEqual({ inset: 344, top: 40 });
    // WPR-8 (the audit's R5-08): iOS scrolling the page up under the keyboard fires only "scroll", and that is when
    // offsetTop moves — the half the comment in lib/keyboard.ts promises, now held by a case of its own
    vv.offsetTop = 120;
    expect(typeof listeners.scroll).toBe("function");
    listeners.scroll();
    expect(useUiStore.getState().keyboardOffsetTop).toBe(120);
    stop();
    expect(vv.removeEventListener).toHaveBeenCalledWith("resize", listeners.resize);
    expect(vv.removeEventListener).toHaveBeenCalledWith("scroll", listeners.scroll);
  });

  it("pressing Enter in a field scrolls the page back to the top, so nothing stays cropped", () => {
    Platform.OS = "web";
    const scrollTo = countScrolls();
    const submitted = jest.fn();
    const { getByTestId } = render(<Field testID="probe" value="Andy" onChangeText={() => {}} placeholder="Find" onSubmitEditing={submitted} />);
    fireEvent(getByTestId("probe"), "submitEditing", { nativeEvent: { text: "Andy" } });
    expect(submitted).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaving a field scrolls the page back to the top as well — once a press that took the focus has landed", () => {
    jest.useFakeTimers();
    Platform.OS = "web";
    const scrollTo = countScrolls();
    const { getByTestId } = render(<Field testID="probe" value="" onChangeText={() => {}} placeholder="Find" />);
    fireEvent(getByTestId("probe"), "focus");
    fireEvent(getByTestId("probe"), "blur");
    // not at the blur itself: a button beside the field can still be under the finger (B-06's grace)
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("while the keyboard is up the tab bar rides on top of it, where the visual viewport ends", () => {
    const bottomOf = () => {
      const u = render(<TabBar active="today" onTab={() => {}} />);
      const bottom = Number(flat(u.getByTestId("tabbar").props.style).bottom);
      u.unmount();
      return bottom;
    };
    const resting = bottomOf();
    useUiStore.getState().setKeyboardInset(344);
    useUiStore.getState().setKeyboardOffsetTop(40);
    expect(bottomOf() - resting).toBe(304);
  });

  it("and so does the orb", () => {
    const bottomOf = () => {
      const u = render(<Orb />);
      // the orb's position is the nearest ancestor of the press target that sets a bottom
      let node = u.getByTestId("mic-orb").parent;
      while (node != null && typeof flat(node.props.style).bottom !== "number") node = node.parent;
      const bottom = Number(flat(node?.props.style).bottom);
      u.unmount();
      return bottom;
    };
    const resting = bottomOf();
    useUiStore.getState().setKeyboardInset(344);
    useUiStore.getState().setKeyboardOffsetTop(40);
    expect(bottomOf() - resting).toBe(304);
  });

  it("over the expanded editor the tab bar and the orb stand down — the editor owns the band above the keyboard (UX-02)", () => {
    useUiStore.getState().setKeyboardInset(344);
    useUiStore.setState({ editorExpanded: true });
    const u = render(
      <>
        <TabBar active="today" onTab={() => {}} />
        <Orb />
      </>,
    );
    expect({ tabbar: u.queryByTestId("tabbar") != null, orb: u.queryByTestId("mic-orb") != null }).toEqual({ tabbar: false, orb: false });
    u.unmount();
  });
});
