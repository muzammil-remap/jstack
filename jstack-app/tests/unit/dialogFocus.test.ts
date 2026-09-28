/**
 * lib/dialogFocus.ts (C-3) — role, initial focus, the Tab trap, and the
 * focus an open dialog hands back on close. Hand-rolled fake DOM nodes, the
 * same shape tests/unit/autoLock.test.ts and shortcuts.test.ts use — this
 * unit lane has no real DOM (`jest-expo`, not jsdom).
 */
import { Platform } from "react-native";
import { firstFocusable, installDialogA11y, markDialog, trapTab } from "@/lib/dialogFocus";

const ORIGINAL_OS = Platform.OS;

type Fake = {
  setAttribute: jest.Mock;
  querySelectorAll: jest.Mock;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  focus: jest.Mock;
};

function fakeFocusable(): { focus: jest.Mock } {
  return { focus: jest.fn() };
}

function fakeContainer(focusables: Array<{ focus: jest.Mock }> = []): Fake {
  return {
    setAttribute: jest.fn(),
    querySelectorAll: jest.fn(() => focusables),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    focus: jest.fn(),
  };
}

function keydown(container: Fake, key: string, shiftKey = false): { preventDefault: jest.Mock } {
  const handler = container.addEventListener.mock.calls.find(([type]) => type === "keydown")?.[1] as ((e: unknown) => void) | undefined;
  const e = { key, shiftKey, preventDefault: jest.fn() };
  handler?.(e);
  return e;
}

beforeEach(() => {
  Platform.OS = "web";
});

afterEach(() => {
  Platform.OS = ORIGINAL_OS;
  Reflect.deleteProperty(globalThis, "document");
});

describe("markDialog — role present", () => {
  it("sets role=dialog and aria-modal=true", () => {
    const node = fakeContainer();
    markDialog(node);
    expect(node.setAttribute).toHaveBeenCalledWith("role", "dialog");
    expect(node.setAttribute).toHaveBeenCalledWith("aria-modal", "true");
  });
});

describe("firstFocusable — focus moved", () => {
  it("returns the first focusable descendant when there is one", () => {
    const first = fakeFocusable();
    const node = fakeContainer([first, fakeFocusable()]);
    expect(firstFocusable(node)).toBe(first);
  });

  it("falls back to the container itself when nothing inside is focusable", () => {
    const node = fakeContainer([]);
    expect(firstFocusable(node)).toBe(node);
  });
});

describe("trapTab — Tab wraps", () => {
  it("Tab on the last item cycles to the first", () => {
    const first = fakeFocusable();
    const last = fakeFocusable();
    const node = fakeContainer([first, last]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: last } });
    trapTab(node);
    const e = keydown(node, "Tab");
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(1);
  });

  it("Shift+Tab on the first item cycles to the last", () => {
    const first = fakeFocusable();
    const last = fakeFocusable();
    const node = fakeContainer([first, last]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: first } });
    trapTab(node);
    const e = keydown(node, "Tab", true);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(last.focus).toHaveBeenCalledTimes(1);
  });

  it("Tab in the middle of the set is left alone", () => {
    const first = fakeFocusable();
    const middle = fakeFocusable();
    const last = fakeFocusable();
    const node = fakeContainer([first, middle, last]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: middle } });
    trapTab(node);
    const e = keydown(node, "Tab");
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(first.focus).not.toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });
});

describe("installDialogA11y — focus restored", () => {
  it("moves focus in on install and restores the opener, one frame after the returned cleanup runs", async () => {
    const opener = fakeFocusable();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: opener } });
    const first = fakeFocusable();
    const node = fakeContainer([first]);

    const cleanup = installDialogA11y(node);
    expect(node.setAttribute).toHaveBeenCalledWith("role", "dialog");
    expect(first.focus).toHaveBeenCalledTimes(1);

    cleanup();
    // C-3: deferred a frame (requestAnimationFrame) past the same commit that
    // can also lift `inert` off the opener elsewhere — see lib/dialogFocus.ts.
    expect(opener.focus).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });

  it("never overrides a control that already claimed focus on its own (GS-02)", () => {
    // Find's query field carries `autoFocus`, which React applies as a plain
    // `.focus()` call during ITS OWN commit — not a queryable DOM attribute,
    // confirmed against the real bundle (neither React nor react-native-web
    // reflects `autoFocus` back to the DOM). By the time this effect runs,
    // the field may already be `document.activeElement`; moving focus to the
    // "first focusable" pick in that case steals it right back onto the
    // dialog's own chrome — Dialog.tsx renders its CloseButton before
    // `{children}`, so "first in DOM order" is the close button on every
    // dialog that has one.
    const queryField = fakeFocusable() as unknown as { focus: jest.Mock; closest: jest.Mock };
    queryField.closest = jest.fn((selector: string) => (selector === '[role="dialog"]' ? {} : null));
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: queryField } });
    const closeButton = fakeFocusable();
    const node = fakeContainer([closeButton, queryField]);

    installDialogA11y(node);
    expect(closeButton.focus).not.toHaveBeenCalled();
    expect(queryField.focus).not.toHaveBeenCalled(); // already had it; no redundant call either
  });

  it("a dialog opened in the same frame the previous one closed keeps its own focus (C-3b)", async () => {
    const openerA = fakeFocusable();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: openerA } });
    const nodeA = fakeContainer([fakeFocusable()]);
    const cleanupA = installDialogA11y(nodeA);

    // A closes (schedules a deferred restore to openerA) and B opens in the
    // same commit, before that restore has had a frame to fire — the exact
    // shape of a detail dialog swapping straight to a picker.
    cleanupA();
    const targetB = fakeFocusable();
    const nodeB = fakeContainer([targetB]);
    installDialogA11y(nodeB);
    expect(targetB.focus).toHaveBeenCalledTimes(1);

    // once A's deferred restore would have fired, it must not have moved
    // focus back onto A's opener and out of the still-open B
    await new Promise((r) => setTimeout(r, 0));
    expect(openerA.focus).not.toHaveBeenCalled();
  });

  it("two dialogs closing in the same frame (closeAll(), C-1) both have their restore cancelled by a third opening (C-3c)", async () => {
    const openerA = fakeFocusable();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: openerA } });
    const cleanupA = installDialogA11y(fakeContainer([fakeFocusable()]));

    const openerB = fakeFocusable();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: openerB } });
    const cleanupB = installDialogA11y(fakeContainer([fakeFocusable()]));

    // closeAll() (C-1) can close the task card AND a modal/sheet in the same
    // commit — both cleanups run, both schedule a deferred restore, before a
    // third dialog opens in that same frame. A single module-level handle
    // would only remember B's schedule and let A's fire anyway.
    cleanupA();
    cleanupB();
    const targetC = fakeFocusable();
    installDialogA11y(fakeContainer([targetC]));
    expect(targetC.focus).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 0));
    expect(openerA.focus).not.toHaveBeenCalled();
    expect(openerB.focus).not.toHaveBeenCalled();
  });

  it("is a no-op off web — native has no working equivalent yet (C-3b)", () => {
    Platform.OS = "ios";
    const node = fakeContainer([fakeFocusable()]);
    const cleanup = installDialogA11y(node);
    expect(node.setAttribute).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });
});
