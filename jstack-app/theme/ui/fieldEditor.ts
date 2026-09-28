/**
 * fieldEditor.ts (E-1) — everything `Field` needs that is not its JSX.
 *
 * `theme/ui/fields.tsx` is a component with a 250-line cap, and E-1 gave the
 * field four new jobs: a resting height in lines, the PC focus ring, Enter
 * sending on desktop, and telling the rest of the app that an editor is open.
 * Adding them in place would have breached the cap, so the state machine and
 * the browser-facing bits live here and `fields.tsx` keeps the markup.
 *
 * The three browser helpers are no-ops off web, so the hook calls them
 * unconditionally and native takes the same path.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, TextInput } from "react-native";
import { useTokens } from "@/theme/ThemeProvider";
import { bp, type as typeScale } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import { useUiStore } from "@/stores/ui";
import { resetPageScroll } from "@/lib/keyboard";

/** Long enough for a press that stole focus to complete, short enough that
 * nobody sees the field linger. */
const BLUR_GRACE_MS = 120;
/** UX-02: "at least 40% of the visible viewport above the keyboard inset". */
const MIN_VIEWPORT_SHARE = 0.4;
/** The editor never takes the whole screen — what you are writing about stays
 * partly visible, the same 85% ceiling `Sheet` uses on a phone. */
const MAX_VIEWPORT_SHARE = 0.85;
/** the field box's own padding. TE-05 asks for at least 10 ("inner padding
 * ≥ 10 px"); it was 9, which is also why the box needed an explicit 36 floor
 * (AA-03) — at 10 a single-line field measures 37 on its own. */
export const FIELD_PADDING = 10;

/** one line of body text, as the box measures it */
const lineHeight = typeScale.size.body * typeScale.lineHeight.body;

/**
 * TE-05, the PC focus ring. Josh works on a PC as well as the phone, and a
 * focused field was showing whatever Chrome draws.
 *
 * react-native-web maps `outlineStyle`/`outlineWidth`/`outlineColor`/
 * `outlineOffset` and `caretColor` straight through to CSS. The ring goes on
 * the field's BOX so it reads as the field being focused rather than the bare
 * textarea inside it, and the input's own UA outline is turned off — two
 * halves of one rule, which is why they are returned together.
 *
 * The border is deliberately untouched: a ring that also thickened the border
 * would move every neighbouring control by a pixel on focus.
 */
function focusRing(accent: string, focused: boolean): { box: object; input: object } {
  if (Platform.OS !== "web") return { box: {}, input: {} };
  return {
    box: focused
      ? { outlineStyle: "solid", outlineWidth: 2, outlineColor: accent, outlineOffset: 2 }
      : { outlineStyle: "none" },
    // the browser's default ring, suppressed only here — hard rule 18's
    // "suppress the UA outline only on Field", so every other control keeps
    // whatever the platform gives a keyboard user
    input: { outlineStyle: "none", caretColor: accent },
  };
}

/**
 * TE-06 / resolution #11. Enter sends; Shift+Enter is a newline.
 *
 * DESKTOP ONLY, and that is the whole subtlety: on a touch keyboard return is
 * how a person writes a second line, there is no shift to hold, and a return
 * mid-dictation must not fire a send. So on touch this returns nothing and the
 * arrow button is the only way to send.
 *
 * `onKeyPress` rather than `onSubmitEditing`: RN's submit event does not carry
 * the modifier, so a multiline field cannot tell Enter from Shift+Enter by it.
 *
 * Exported (MC-05) so a test exercises this table directly rather than
 * simulating a `TextInput` keypress — the same reason `theme/useLayout.ts`'s
 * `layoutFor` is exported.
 */
export function enterSends(opts: { desktop: boolean; onSend?: () => void }): object {
  if (Platform.OS !== "web" || !opts.desktop || opts.onSend == null) return {};
  const send = opts.onSend;
  return {
    onKeyPress: (e: { nativeEvent: { key: string }; shiftKey?: boolean; preventDefault?: () => void }) => {
      if (e.nativeEvent.key !== "Enter") return;
      if (e.shiftKey === true) return; // a newline, deliberately
      e.preventDefault?.();
      send();
    },
  };
}

/**
 * TE-02. The expanded editor has to be inside the band the person can see —
 * being the right HEIGHT for the band is not being IN it, and on iOS Safari
 * scrolls the layout viewport up under the keyboard, so a field sized
 * correctly can still be drawn behind it.
 *
 * `scrollIntoView({ block: "nearest" })` is the browser's own answer and it
 * moves whichever scroller the field actually sits in, which matters because
 * these fields each live in a different ScrollView. `nearest` so a field
 * already inside the band does not jump.
 */
function scrollIntoBand(node: unknown, band: { top: number; height: number }): void {
  if (Platform.OS !== "web") return;
  const el = node as {
    getBoundingClientRect?: () => { top: number; bottom: number };
    scrollIntoView?: (opts: { block: string; behavior: string }) => void;
  } | null;
  if (el?.scrollIntoView == null) return;
  // Only move if the editor is actually OUTSIDE the band. This is what
  // `keyboardOffsetTop` is for: the band starts where the visual viewport
  // starts, which on iOS is not the top of the layout viewport once Safari has
  // scrolled it up under the keyboard. Without the offset the test would be
  // "is it on screen", which is the wrong question and true when it is not.
  //
  // And a smooth scroll on every focus is motion nobody asked for — on a field
  // already in view it reads as the page twitching.
  const rect = el.getBoundingClientRect?.();
  if (rect != null && rect.top >= band.top && rect.bottom <= band.top + band.height) return;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export type FieldEditor = {
  inner: React.RefObject<TextInput | null>;
  touch: boolean;
  expands: boolean;
  expanded: boolean;
  /** the box style for the focused/resting size, or null */
  sizing: object | null;
  restStyle: object | null;
  ring: { box: object; input: object };
  enter: object;
  open: () => void;
  close: () => void;
  focusInput: () => void;
};

export function useFieldEditor(opts: {
  multiline: boolean;
  expandOnFocus?: boolean;
  restLines?: number;
  onSend?: () => void;
}): FieldEditor {
  const c = useTokens();
  const { width, height } = useLayout();
  const keyboardInset = useUiStore((s) => s.keyboardInset);
  const setEditorExpanded = useUiStore((s) => s.setEditorExpanded);
  const [focused, setFocused] = useState(false);
  const inner = useRef<TextInput | null>(null);

  // UX-03: on desktop the field grows in place — there is no soft keyboard
  // eating the viewport, so there is nothing to escape.
  const touch = width < bp.desktop;
  const expands = (opts.expandOnFocus ?? opts.multiline) && touch;
  const expanded = expands && focused;

  // UX-02: the viewport the user can actually see, with the keyboard off it
  const visible = Math.max(0, height - keyboardInset);

  /**
   * Collapse when focus leaves — but not on the same tick.
   *
   * Pressing the field's own send button blurs the input first. Collapsing
   * there and then takes ~180px of height out from under a press still in
   * flight: the button moves before the pointer is released and the click
   * never completes. Found by driving it (B-06), not by reading it.
   */
  const collapse = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelCollapse = useCallback(() => {
    if (collapse.current != null) {
      clearTimeout(collapse.current);
      collapse.current = null;
    }
  }, []);
  const open = useCallback(() => {
    cancelCollapse();
    setFocused(true);
  }, [cancelCollapse]);
  const close = useCallback(() => {
    cancelCollapse();
    // WPR-4 (c): leaving a field puts the page back at the top, as Enter does — at the collapse, after the grace, for
    // the reason the collapse waits
    collapse.current = setTimeout(() => {
      setFocused(false);
      resetPageScroll();
    }, BLUR_GRACE_MS);
  }, [cancelCollapse]);
  useEffect(() => cancelCollapse, [cancelCollapse]);
  const focusInput = useCallback(() => {
    cancelCollapse();
    setFocused(true);
    inner.current?.focus();
  }, [cancelCollapse]);

  /**
   * TE-03: while this field is the expanded editor, the demo watermark and the
   * mock banner get out of its way. The flag is app-wide because the chrome
   * reading it is app-wide, and the cleanup is what puts it back — including
   * when the field unmounts mid-edit, which a blur handler alone would miss.
   *
   * TE-02: the editor is also scrolled into the band it now fills.
   */
  useEffect(() => {
    if (!expanded) return;
    setEditorExpanded(true);
    // The band is read at effect time rather than subscribed to: the keyboard
    // resizing mid-edit should not re-run a smooth scroll on every frame of
    // the animation, and the question here is only "where is the band NOW".
    const ui = useUiStore.getState();
    scrollIntoBand(inner.current, { top: ui.keyboardOffsetTop, height: Math.max(0, height - ui.keyboardInset) });
    return () => setEditorExpanded(false);
  }, [expanded, setEditorExpanded, height]);

  return {
    inner,
    touch,
    expands,
    expanded,
    sizing: expanded ? { minHeight: visible * MIN_VIEWPORT_SHARE, maxHeight: visible * MAX_VIEWPORT_SHARE } : null,
    // TE-01: the resting height, in lines — how tall the empty box is before
    // anyone touches it. Never a ceiling; the ceiling is a maxHeight.
    restStyle: opts.restLines != null && !expanded ? { minHeight: opts.restLines * lineHeight + FIELD_PADDING * 2 } : null,
    // TE-05: `accentInk` is the tone the pack gives a tappable phrase, and
    // hard rule 20 wants a state to take a token rather than a colour.
    ring: focusRing(c.accentInk, focused),
    // TE-06: `touch` is the same test the expanded editor uses, so the two can
    // never disagree about which width is a desktop.
    enter: enterSends({ desktop: !touch, onSend: opts.onSend }),
    open,
    close,
    focusInput,
  };
}
