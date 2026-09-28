/**
 * lib/shortcuts.ts — the desktop keyboard shortcut deck (C-2, C-5).
 */
import { Platform } from "react-native";
import { installShortcuts } from "@/lib/shortcuts";

const ORIGINAL_OS = Platform.OS;

type Listener = (e: unknown) => void;
let keydown: Listener | null = null;

function stubWindow(): void {
  Platform.OS = "web";
  const win = {
    addEventListener: (type: string, fn: Listener) => {
      if (type === "keydown") keydown = fn;
    },
    removeEventListener: (type: string, fn: Listener) => {
      if (type === "keydown" && keydown === fn) keydown = null;
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
}

type FakeTarget = { tagName?: string; isContentEditable?: boolean } | null;

function fire(target: FakeTarget, key: string, mods: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean } = {}): void {
  const e = {
    key,
    metaKey: mods.metaKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    altKey: mods.altKey ?? false,
    repeat: mods.repeat ?? false,
    target,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  keydown?.(e);
}

const INPUT: FakeTarget = { tagName: "INPUT", isContentEditable: false };

function baseHandlers(overrides: Partial<Parameters<typeof installShortcuts>[0]> = {}): Parameters<typeof installShortcuts>[0] {
  return {
    onTab: jest.fn(),
    onEscape: jest.fn(),
    onFind: jest.fn(),
    onUndo: jest.fn(),
    onApprove: jest.fn(),
    onRevise: jest.fn(),
    onLater: jest.fn(),
    hasOpenCard: () => false,
    hasOpenOverlay: () => false,
    isExpandedLayout: () => true,
    ...overrides,
  };
}

beforeEach(() => {
  stubWindow();
});

afterEach(() => {
  Platform.OS = ORIGINAL_OS;
  Reflect.deleteProperty(globalThis, "window");
  keydown = null;
});

describe("installShortcuts · Escape (C-2)", () => {
  it("closes a dialog from inside a text field when one is open — the caps dialog's amount box", () => {
    const handlers = baseHandlers({ hasOpenOverlay: () => true });
    installShortcuts(handlers);
    fire(INPUT, "Escape");
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it("does nothing from inside a text field when nothing is open — Escape is not a stray keystroke", () => {
    const handlers = baseHandlers({ hasOpenOverlay: () => false });
    installShortcuts(handlers);
    fire(INPUT, "Escape");
    expect(handlers.onEscape).not.toHaveBeenCalled();
  });

  it("still fires with focus off a text field, whether or not anything is open", () => {
    const handlers = baseHandlers({ hasOpenOverlay: () => false });
    installShortcuts(handlers);
    fire(null, "Escape");
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it("a letter is still ignored while typing, even with a dialog open", () => {
    const handlers = baseHandlers({ hasOpenCard: () => true, hasOpenOverlay: () => true });
    installShortcuts(handlers);
    fire(INPUT, "a");
    expect(handlers.onApprove).not.toHaveBeenCalled();
  });
});

describe("installShortcuts · the letter deck is Expanded-layout only (C-5)", () => {
  it("a/r/l do nothing at a phone width, even with an open card", () => {
    const handlers = baseHandlers({ hasOpenCard: () => true, isExpandedLayout: () => false });
    installShortcuts(handlers);
    fire(null, "a");
    fire(null, "r");
    fire(null, "l");
    expect(handlers.onApprove).not.toHaveBeenCalled();
    expect(handlers.onRevise).not.toHaveBeenCalled();
    expect(handlers.onLater).not.toHaveBeenCalled();
  });

  it("a/r/l still work at a desktop width with an open card", () => {
    const handlers = baseHandlers({ hasOpenCard: () => true, isExpandedLayout: () => true });
    installShortcuts(handlers);
    fire(null, "a");
    expect(handlers.onApprove).toHaveBeenCalledTimes(1);
  });

  it("digit tabs and Cmd/Ctrl+K still work at a phone width — only the letter deck is gated", () => {
    const handlers = baseHandlers({ isExpandedLayout: () => false });
    installShortcuts(handlers);
    fire(null, "3");
    fire(null, "k", { metaKey: true });
    expect(handlers.onTab).toHaveBeenCalledWith(3);
    expect(handlers.onFind).toHaveBeenCalledTimes(1);
  });
});
