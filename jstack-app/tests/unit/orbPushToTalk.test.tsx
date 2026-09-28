/**
 * v2.3.2 WPR-1 / WPR-2 — Josh, 16 Sep, on his iPhone, on the mock built that morning: "It's there but no longer floating. There is
 * a band across the screen wasting valuable screen space. Confirm this is push to talk, and mic turns off when button
 * released. Should do the same thing as 'dictate to ea' on brain tab. … When not in use it should be subtle and semi
 * transparent until pushed, where it becomes more prominent. … ensure the clickable ptt button area is slightly
 * larger than the button image."
 *
 * The microphone itself is `lib/mic.ts`'s, faked here at its two doors (start, stop) so the orb's own behaviour is
 * what is under test: press-in opens a Brain session, release closes it and files the words through the same
 * `POST /brain/dump` Brain's dictation uses (`source: "voice"`), and a tap too short to be a hold files nothing.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Orb } from "@/components/chrome/Orb";
import { reset as resetDb } from "@/data/mock/db";
import { setLockSource } from "@/lib/lockGate";
import { startMic, stopMicFor } from "@/lib/mic";
import { useBrainStore } from "@/stores/brain";
import { useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";

/** what the fake microphone will have heard by the time it is stopped (null: nothing) */
const mockMic: { words: string | null; opts: { onFinal?: (t: string) => void } | null } = { words: null, opts: null };

jest.mock("@/lib/mic", () => {
  const actual = jest.requireActual("@/lib/mic");
  return {
    ...actual,
    startMic: jest.fn(async (opts: { purpose: string; onFinal?: (t: string) => void }) => {
      mockMic.opts = opts;
      jest.requireActual("@/stores/mic").useMicStore.setState({ state: "listening", purpose: opts.purpose });
      return { stop: () => {} };
    }),
    stopMicFor: jest.fn(() => {
      if (mockMic.words != null) mockMic.opts?.onFinal?.(mockMic.words);
      jest.requireActual("@/stores/mic").useMicStore.setState({ state: "off", purpose: null });
    }),
  };
});

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
let clock = 1_000_000;
// WPR-7 (the audit's R5-01): one loaded board timed a case out at 5000 ms that runs in 177 ms alone; the budget WPI-3 gave
// the fresh-app cases, for the same reason — the machine, not the case.
jest.setTimeout(60_000);

beforeEach(() => {
  resetDb();
  useSessionStore.setState({ modal: null, sheet: null, settingsOpen: false, toast: null });
  useMicStore.getState().clear();
  mockMic.words = null;
  mockMic.opts = null;
  clock = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe("WPR-2 · the orb is push-to-talk: press-in opens the microphone, release closes it and files the words", () => {
  it("press-in opens a Brain session; a release after a real hold closes it and files what was heard, as voice", async () => {
    const dump = jest.spyOn(useBrainStore.getState(), "dump").mockResolvedValue();
    const u = render(<Orb />);
    fireEvent(u.getByTestId("mic-orb"), "pressIn");
    await settle();
    expect(startMic).toHaveBeenCalledWith(expect.objectContaining({ purpose: "brain" }));
    // the orb stays while its own session is open, or the release would land on nothing and the mic stay on
    expect(u.queryByTestId("mic-orb")).not.toBeNull();

    mockMic.words = "Ring the school about the Term 4 dates";
    clock += 900;
    fireEvent(u.getByTestId("mic-orb"), "pressOut");
    await settle();
    expect(stopMicFor).toHaveBeenCalledWith("brain");
    expect(dump).toHaveBeenCalledWith("voice", "Ring the school about the Term 4 dates");
    u.unmount();
  });

  it("a tap shorter than a hold closes the microphone and files nothing", async () => {
    const dump = jest.spyOn(useBrainStore.getState(), "dump").mockResolvedValue();
    const u = render(<Orb />);
    fireEvent(u.getByTestId("mic-orb"), "pressIn");
    await settle();
    mockMic.words = "half a word";
    clock += 120;
    fireEvent(u.getByTestId("mic-orb"), "pressOut");
    await settle();
    expect(stopMicFor).toHaveBeenCalledWith("brain");
    expect(dump).not.toHaveBeenCalled();
    u.unmount();
  });

  it("WPR-6: a hold released after the app locked keeps its words as Brain's draft and says so, and files nothing", async () => {
    // the audit's R5-05: the gate refuses POST /brain/dump while locked (lib/lockGate.ts), and the refusal used to be an
    // unhandled rejection — no toast, no draft, the spoken words gone
    const u = render(<Orb />);
    fireEvent(u.getByTestId("mic-orb"), "pressIn");
    await settle();
    setLockSource(() => true); // the gate reads the session's lock; tests/setup.ts opens it, so this case closes it itself
    useSessionStore.setState({ locked: true });
    mockMic.words = "Book the dentist for the twins";
    clock += 900;
    fireEvent(u.getByTestId("mic-orb"), "pressOut");
    await settle();
    await settle();
    expect({
      draft: useBrainStore.getState().dumpDraft,
      toast: useSessionStore.getState().toast?.message ?? null,
      mic: useMicStore.getState().state,
    }).toEqual({ draft: "Book the dentist for the twins", toast: "Locked · your words are kept in Brain", mic: "off" });
    setLockSource(() => false);
    useSessionStore.setState({ locked: false });
    useBrainStore.getState().setDumpDraft("");
    u.unmount();
  });

  it("WPR-9: a locked release with a draft already in the field keeps both — the words join the draft on a new line", async () => {
    // the audit's R5b-01: the first fix kept the words only when the field was empty, and said "kept" when it had dropped them
    useBrainStore.getState().setDumpDraft("a note I typed first");
    const u = render(<Orb />);
    fireEvent(u.getByTestId("mic-orb"), "pressIn");
    await settle();
    setLockSource(() => true);
    useSessionStore.setState({ locked: true });
    mockMic.words = "and the dentist for the twins";
    clock += 900;
    fireEvent(u.getByTestId("mic-orb"), "pressOut");
    await settle();
    await settle();
    expect({ draft: useBrainStore.getState().dumpDraft, toast: useSessionStore.getState().toast?.message ?? null }).toEqual({
      draft: "a note I typed first\nand the dentist for the twins",
      toast: "Locked · your words are kept in Brain",
    });
    setLockSource(() => false);
    useSessionStore.setState({ locked: false });
    useBrainStore.getState().setDumpDraft("");
    u.unmount();
  });

  it("a hold that heard nothing files nothing", async () => {
    const dump = jest.spyOn(useBrainStore.getState(), "dump").mockResolvedValue();
    const u = render(<Orb />);
    fireEvent(u.getByTestId("mic-orb"), "pressIn");
    await settle();
    clock += 1500;
    fireEvent(u.getByTestId("mic-orb"), "pressOut");
    await settle();
    expect(dump).not.toHaveBeenCalled();
    u.unmount();
  });
});

describe("WPR-1 · the orb floats: subtle at rest, prominent while held, a hit area larger than the drawing, and no band", () => {
  it("at rest the drawn circle is about half-transparent with no shadow; held, it is opaque, lifted and 6% larger", async () => {
    const u = render(<Orb />);
    // the circle is what is drawn; `mic-orb` is the press target around it, larger by the slop below
    const circle = () => u.queryByTestId("mic-orb-circle");
    expect(circle()).not.toBeNull();
    const rest = flat(circle()!.props.style);
    expect({ opacity: rest.opacity, shadow: rest.shadowOpacity ?? rest.boxShadow ?? null }).toEqual({ opacity: 0.55, shadow: null });

    fireEvent(u.getByTestId("mic-orb"), "pressIn");
    await settle();
    const held = flat(circle()!.props.style);
    expect(held.opacity).toBe(1);
    expect(held.shadowOpacity ?? held.boxShadow).toBeTruthy();
    expect(held.transform).toEqual([{ scale: 1.06 }]);
    fireEvent(u.getByTestId("mic-orb"), "pressOut");
    await settle();
    u.unmount();
  });

  it("the press lands 12 px or more outside the drawn circle on every side", () => {
    const u = render(<Orb />);
    const slop = u.getByTestId("mic-orb").props.hitSlop as number | { top: number; right: number; bottom: number; left: number };
    const sides = typeof slop === "number" ? [slop, slop, slop, slop] : [slop.top, slop.right, slop.bottom, slop.left];
    expect(Math.min(...sides)).toBeGreaterThanOrEqual(12);
    u.unmount();
  });

  it("the tab page reserves no band for the orb: it runs to the tab bar, and only its padding clears the orb", () => {
    const src = readFileSync(join(__dirname, "..", "..", "layout", "TabScreen.tsx"), "utf8");
    expect(src).not.toContain("ORB_BAND");
    expect(src).toMatch(/paddingBottom: [^\n]*ORB_CLEARANCE/);
  });
});
