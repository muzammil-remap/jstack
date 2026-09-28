/**
 * v2.3.2 WPR-3 — Josh, 16 Sep: "Dictate to ea mic button is waaay too small. Make it a large orb centre bottom of the
 * screen like the 'talk with ea'." The control is the small mic inside the Dictate to EA sheet's field (his second
 * screenshot, through the planner). It becomes the floating orb's own control (`OrbControl`) at Talk's size, centred
 * under the field and held: press-in starts the dictation, release stops it, and the words land in the field for
 * review as they did — nothing reaches the thread until the field's arrow. Every tab keeps the floating orb, Brain's
 * included: one orb per screen, and the floating one stands down while the sheet is open, as over any overlay.
 * The microphone is faked at its doors, as in `tests/unit/orbPushToTalk.test.tsx`.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DictateDialog } from "@/components/brain/DictateDialog";
import { reset as resetDb } from "@/data/mock/db";
import { startMic } from "@/lib/mic";
import { useDictateStore } from "@/stores/dictate";
import { useMicStore } from "@/stores/mic";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { FieldButton } from "@/theme/ui";

const mockMic: { opts: { purpose: string; onFinal?: (t: string) => void } | null } = { opts: null };

jest.mock("@/lib/mic", () => {
  const actual = jest.requireActual("@/lib/mic");
  const off = () => jest.requireActual("@/stores/mic").useMicStore.setState({ state: "off", purpose: null });
  return {
    ...actual,
    startMic: jest.fn(async (opts: { purpose: string; onFinal?: (t: string) => void }) => {
      mockMic.opts = opts;
      jest.requireActual("@/stores/mic").useMicStore.setState({ state: "listening", purpose: opts.purpose });
      return { stop: off };
    }),
    stopMicFor: jest.fn(off),
    stopActiveMic: jest.fn(off),
  };
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <GestureHandlerRootView>
        <ThemeProvider>{children}</ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const app = join(__dirname, "..", "..");

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  resetDb();
  useMicStore.getState().clear();
  mockMic.opts = null;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("WPR-3 · Dictate to EA's microphone is a large press-and-hold orb, centred at the foot of the sheet", () => {
  it("the orb is Talk's size, centred in the sheet's foot below its scrolling content, and the field keeps only its arrow", async () => {
    const u = render(
      <Providers>
        <DictateDialog onClose={() => {}} />
      </Providers>,
    );
    await settle();
    expect(flat(u.getByTestId("dictate-mic-circle").props.style).width).toBe(96);
    const field = within(u.getByTestId("dictate-input-box"));
    expect({ micInField: field.queryByTestId("dictate-mic") != null, buttonsInField: field.UNSAFE_queryAllByType(FieldButton).length }).toEqual({ micInField: false, buttonsInField: 1 });
    // Josh: "a large orb centre bottom of the screen like the 'talk with ea'" — the dialog's foot, which on a phone is
    // the bottom of the screen, not the scrolling content under the field
    const foot = u.getByTestId("dictate-dialog-footer");
    expect({ inFoot: within(foot).queryByTestId("dictate-mic") != null, centred: flat(u.getByTestId("dictate-orb-block").props.style).alignItems }).toEqual({ inFoot: true, centred: "center" });
    u.unmount();
  });

  it("a hold starts the dictation, the words land in the field, and the release stops it — nothing reaches the thread", async () => {
    const toThread = jest.spyOn(useDictateStore.getState(), "sendChat");
    const u = render(
      <Providers>
        <DictateDialog onClose={() => {}} />
      </Providers>,
    );
    await settle();
    fireEvent(u.getByTestId("dictate-mic"), "pressIn");
    await settle();
    expect(startMic).toHaveBeenCalledWith(expect.objectContaining({ purpose: "dictate" }));
    expect(useMicStore.getState().state).toBe("listening");
    act(() => {
      mockMic.opts?.onFinal?.("Ask Andy for the date");
    });
    expect(u.getByTestId("dictate-input").props.value).toBe("Ask Andy for the date");
    fireEvent(u.getByTestId("dictate-mic"), "pressOut");
    await settle();
    expect({ mic: useMicStore.getState().state, field: u.getByTestId("dictate-input").props.value, thread: toThread.mock.calls.length }).toEqual({
      mic: "off",
      field: "Ask Andy for the date",
      thread: 0,
    });
    u.unmount();
  });

  it("the tabs keep the floating orb on every tab, Brain's included, and the tab page pads for that one alone", () => {
    const layout = readFileSync(join(app, "app", "(tabs)", "_layout.tsx"), "utf8");
    expect(layout).not.toMatch(/<Orb variant=/);
    expect(layout).toMatch(/\n\s*<Orb \/>\n/);
    expect(readFileSync(join(app, "layout", "TabScreen.tsx"), "utf8")).not.toContain("ORB_CLEARANCE_LARGE");
  });
});
