/**
 * Field primitives (S-2 split of theme/ui.tsx, ADR-33): Field, FieldButton.
 *
 * S-2b adds "Field expands on focus" (UX-01..03) — Josh, 6 Sep: "I don't
 * want to be scrolling up and down a small text box on my iPhone." Because
 * every text entry in the app already goes through `Field` — dump, journal,
 * chat, find, teach, revise, proposal edit, rule edit, configure — the
 * behaviour is one implementation here rather than nine.
 *
 * The field grows IN PLACE rather than opening a separate surface. That is
 * a deliberate departure from the row's wording ("renders as a screen-kind
 * surface"), taken on evidence: the overlay was built first and the e2e
 * board found it broke eight flows at 393. Seven dialogs in this app put
 * their Save or Send button beside the field rather than inside it, and an
 * overlay — RN's `Modal` is the only portal that escapes the ScrollViews
 * that would clip it, and it captures pointer events whatever you set
 * `pointerEvents` to — buries those buttons. In-place growth meets every
 * requirement UX-01..03 actually states (content width, at least 40% of the
 * viewport above the keyboard, grows with content, scrolls inside itself,
 * controls at its foot, collapses on blur, two-line preview with a
 * continue link) and leaves every surrounding control reachable. S-3's
 * dialog registry adds the real `screen` kind; if a separate surface is
 * still wanted then, that is where it belongs. NEEDS_JOSH.md records it.
 */
// The state machine, the geometry and the browser-facing bits moved to
// `fieldEditor.ts` at E-1, which is why the React hooks and the breakpoint
// table are no longer imported here.
import React from "react";
import { Platform, StyleProp, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { resetPageScroll } from "@/lib/keyboard";
import { useTokens } from "@/theme/ThemeProvider";
import { fonts, radius, type as typeScale } from "@/theme/tokens";
import { FIELD_PADDING, useFieldEditor } from "./fieldEditor";
import { Txt } from "./text";

/** v2.3.2 WPR-4 (a): iOS zooms the page onto any focused field under this size */
const WEB_INPUT_MIN_FONT = 16;

/** `.field` (mock v11 lines 176-179) — a bordered text input with an
 * optional `right` slot for io buttons (mic, send). */
export function Field({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  interim = false,
  restLines,
  onSend,
  left,
  right,
  style,
  testID,
  accessibilityLabel,
  inputRef,
  expandOnFocus,
  ...rest
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /**
   * UX-01: whether focusing this field on a touch width opens the expanded
   * editor. Defaults to `multiline`, which is the safer reading of the row:
   * the complaint was about writing prose in a small box, and expanding a
   * one-line name or a numeric width to 40% of the screen would be a defect,
   * not a fix. A caller can force it either way. Recorded in NEEDS_JOSH.md.
   */
  expandOnFocus?: boolean;
  /**
   * TE-01: how many lines the field is TALL AT REST, before anything is typed
   * and before focus. Josh, on the mind-dump box: it is the main thing on the
   * page and it was a one-line slot. The dump box passes 3 on desktop and 4 on
   * phone; everything else leaves this unset and keeps `minHeight: 36`.
   *
   * A rest height, never a ceiling — the ceiling is `maxHeight` below, and the
   * two were confused once already (see the `numberOfLines` note).
   */
  restLines?: number;
  /**
   * TE-06: what Enter does on desktop. A field that can be sent from the
   * keyboard names the same action its send button runs; a field without one
   * (the journal) leaves this unset and Enter stays a newline.
   */
  onSend?: () => void;
  /**
   * MC-04: the value currently in the field is an INTERIM transcript — what
   * the recogniser has heard so far, not what it has settled on. It renders in
   * the muted tone so a person can see the difference between "the machine is
   * still thinking" and "this is your text now"; the final transcript replaces
   * it and the tone goes back to ink.
   *
   * A tone rather than a second overlaid element, because the text really is
   * the field's value (ADR-49): it stays for review, and the send control
   * files it, whether it arrived by voice or by keyboard.
   */
  interim?: boolean;
  /** a LEADING adornment — handoff.md gives the Brain Find field one ("Find
   * field (card, search icon, placeholder)") and the field had no slot for it
   * (ux-review round 9). */
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  /** so a caller's own control can focus this input — the journal's keyboard
   * button is the mic's pair and has to put the caret in the field (D21). */
  inputRef?: React.RefObject<TextInput | null>;
} & Omit<TextInputProps, "value" | "onChangeText" | "placeholder" | "multiline" | "style">) {
  const c = useTokens();
  const hasDraft = value.trim() !== "";
  // The state machine, the geometry and the browser-facing bits live in
  // `fieldEditor.ts` — E-1 gave this field four more jobs and the component
  // has a 250-line cap (hard rule 3, split before you exceed).
  const { inner, touch, expands, expanded, sizing, restStyle, ring, enter, open, close, focusInput } = useFieldEditor({
    multiline,
    expandOnFocus,
    restLines,
    onSend,
  });
  return (
    <>
      <View
        testID={testID != null ? `${testID}-box` : undefined}
        style={[
          // minHeight 36: GL-05's floor applies to a text field as much as a
          // button, and at padding 9 a single-line field came out 35 (AA-03).
          // B3R2-04: the Card fill, on every field. Transparent was invisible on
          // an opaque card and a window on a translucent sheet — the config
          // dialog's Title showed the page through it two rows above a filled
          // ListCard. handoff.md calls the dump and Find boxes "card".
          // TE-05 raised the padding from 9 to 10 ("inner padding ≥ 10"), which
          // also puts the single-line box at 37 and clear of GL-05's 36 floor
          // by construction rather than by the minHeight below.
          { flexDirection: "row", gap: 8, alignItems: expanded ? "flex-end" : "flex-start", minHeight: 36, borderWidth: 1, borderColor: c.hairline, borderRadius: radius.control, padding: FIELD_PADDING, backgroundColor: c.card },
          style,
          // TE-01: the resting height, after `style` so a call site cannot
          // silently undo it, before `expanded` so focus still wins.
          restStyle,
          // TE-05: the PC focus ring, on the box so it reads as the field
          ring.box,
          // UX-01/UX-02: focused on a touch width, the field becomes the
          // editor in place — at least 40% of what is visible above the
          // keyboard, growing with the content to a ceiling, then scrolling
          // inside itself. `style` is overridden deliberately: a call site's
          // own minHeight/height is the resting size, not the focused one.
          sizing,
          // UX-03: on desktop the field grows in place with its content and
          // stops at twelve lines. A ceiling, expressed as one — see the
          // note on `numberOfLines` below for why it cannot live there.
          !touch && multiline ? { maxHeight: DESKTOP_MAX_LINES * typeScale.size.body * typeScale.lineHeight.body + FIELD_PADDING * 2 } : null,
        ]}
      >
        {left}
        <TextInput
          {...rest}
          // both: the caller may hold its own ref (the journal's keyboard
          // button focuses the field), and `continue` needs one too
          ref={(node) => {
            inner.current = node;
            if (inputRef != null) inputRef.current = node;
          }}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? placeholder}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          multiline={multiline}
          // `numberOfLines` is the TWO-LINE PREVIEW and nothing else.
          //
          // It is not a ceiling. react-native-web renders it as a textarea's
          // `rows` (TextInput/index.js: `rows = multiline ? numberOfLines : 1`),
          // which is a FIXED height — so the first cut of UX-03, which passed
          // DESKTOP_MAX_LINES here to mean "grows up to twelve lines", made
          // every multiline field on desktop render twelve rows tall at rest:
          // ~193px of mostly empty box where the mock has a two-row textarea.
          // The board could not see it and the ux-reviewer could (round 15,
          // D1). The desktop ceiling is a `maxHeight` on the box below, which
          // is what a ceiling actually is.
          numberOfLines={!expanded && expands && hasDraft ? PREVIEW_LINES : undefined}
          // TE-05: focus is tracked on EVERY field, not just the ones that
          // expand. It used to be wired only under `expands` — touch widths
          // and multiline — so on a PC `focused` was never true and a focus
          // ring hung off it would never have appeared. `expanded` is still
          // `expands && focused`, so nothing about the editor changes.
          onFocus={open}
          onBlur={close}
          scrollEnabled={expanded ? true : undefined}
          textAlignVertical={expanded ? "top" : undefined}
          {...enter}
          // WPR-4 (c): Enter scrolls the page back to the top, so nothing stays cropped once the keyboard goes
          onSubmitEditing={(e) => {
            rest.onSubmitEditing?.(e);
            resetPageScroll();
          }}
          // WPR-4 (a) reverses TE-01's choice. TE-01 kept the pack's 12.5 px and answered the iOS focus zoom with
          // `maximum-scale=1` in the head; on Josh's iPhone (Brave, 16 Sep) the page still zoomed on Brain's dump field
          // and on Find. iOS zooms any field under 16 px on focus, so on the web the input is 16 px or more; native
          // keeps the pack's body size, having no page to zoom.
          style={[{ flex: 1, minWidth: 0, alignSelf: "stretch", fontFamily: fonts.body, fontSize: Platform.OS === "web" ? Math.max(WEB_INPUT_MIN_FONT, typeScale.size.body) : typeScale.size.body, color: interim ? c.muted : c.ink, padding: 0 }, ring.input]}
        />
        {/* blur with text keeps a two-line preview and a way back in */}
        {expands && hasDraft && !expanded && (
          <Txt kind="meta" tone="accentInk" testID={`${testID}-continue`} onPress={focusInput} accessibilityLabel="Continue writing">
            continue
          </Txt>
        )}
        {/* UX-02: the mic/send controls stay in the row, which is the foot
            of the field once it has grown — `alignItems` below is what
            pins them there rather than leaving them floating at the top */}
        {right != null && <View style={{ flexDirection: "row", gap: 4 }}>{right}</View>}
      </View>
    </>
  );
}

/** The preview a collapsed field with text keeps (UX-01). */
const PREVIEW_LINES = 2;
/** UX-03: how far a desktop field grows in place before it scrolls.
 * Applied as a `maxHeight`, never as `numberOfLines` — see the note at the
 * TextInput. */
const DESKTOP_MAX_LINES = 12;
