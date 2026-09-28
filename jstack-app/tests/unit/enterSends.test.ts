/**
 * MC-05, TE-06, `02_ACCEPTANCE_TESTS_v22.md` — Enter sends the dump (same as
 * the arrow); Shift+Enter inserts a newline; a field with no `onSend` (the
 * journal, and every other multi-line field) keeps Enter as a newline;
 * desktop only — on touch, return inserts a newline and the arrow sends.
 */
import { Platform } from "react-native";
import { enterSends } from "@/theme/ui/fieldEditor";

const ORIGINAL_OS = Platform.OS;

type KeyPressProps = { onKeyPress?: (e: { nativeEvent: { key: string }; shiftKey?: boolean; preventDefault?: () => void }) => void };

beforeEach(() => {
  Platform.OS = "web";
});
afterEach(() => {
  Platform.OS = ORIGINAL_OS;
});

describe("MC-05 · Enter sends, Shift+Enter is a newline, desktop only", () => {
  it("Enter with no shift calls onSend and prevents the default newline", () => {
    const onSend = jest.fn();
    const props = enterSends({ desktop: true, onSend }) as KeyPressProps;
    const preventDefault = jest.fn();
    props.onKeyPress?.({ nativeEvent: { key: "Enter" }, shiftKey: false, preventDefault });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("Shift+Enter does not send — a newline, deliberately", () => {
    const onSend = jest.fn();
    const props = enterSends({ desktop: true, onSend }) as KeyPressProps;
    props.onKeyPress?.({ nativeEvent: { key: "Enter" }, shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("a key other than Enter is ignored", () => {
    const onSend = jest.fn();
    const props = enterSends({ desktop: true, onSend }) as KeyPressProps;
    props.onKeyPress?.({ nativeEvent: { key: "a" }, shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("on touch (desktop: false) there is no onKeyPress at all — return stays a newline, the arrow sends", () => {
    const props = enterSends({ desktop: false, onSend: jest.fn() }) as KeyPressProps;
    expect(props.onKeyPress).toBeUndefined();
  });

  it("a field with no onSend (the journal, and multi-line fields generally) gets no onKeyPress either", () => {
    const props = enterSends({ desktop: true }) as KeyPressProps;
    expect(props.onKeyPress).toBeUndefined();
  });

  it("off web (native), no onKeyPress — the platform has no keyboard modifier to read", () => {
    Platform.OS = "ios";
    const props = enterSends({ desktop: true, onSend: jest.fn() }) as KeyPressProps;
    expect(props.onKeyPress).toBeUndefined();
  });
});
