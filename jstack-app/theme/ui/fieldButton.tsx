/**
 * `FieldButton` — the 30px icon button that lives in a `Field`'s `right`
 * slot (the mic and the send arrow).
 *
 * Its own file since M-1: `fields.tsx` crossed SM-03's 250-line cap once
 * UX-03's desktop ceiling was written out properly, and of the two things
 * in there this is the one with no relationship to the other — `Field` is
 * about text and layout, this is a control that happens to sit next to it.
 */
import React from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import { touchSlop } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { misc, radius } from "@/theme/tokens";
import { Icon } from "@/components/chrome/Icon";
import type { IconName } from "@/components/chrome/icons.generated";
import { Pulse } from "@/components/chrome/LiveMicOrb";
import { Txt } from "./text";
import { type ButtonAction, useButtonChrome } from "./controls";

/** S6-18: the live glyph is the pack's Listening orb in miniature — a Marker
 * circle with the white glyph and the 1.4s pulse ring (README Mic; Colour:
 * Marker is "mic while listening; the only saturated colour"). 22 in a 30px
 * control, and the ring grows to the control's own 30 rather than the pack's
 * +14, for the reason the 8px working marker gives (T-5): a ring larger than
 * its box reads as a target, not a pulse. */
const LIVE_GLYPH = 22;
const LIVE_RING_GROWTH = 8;

/** A `.field .io button` — 30px icon button that lives in a <Field>'s
 * `right` slot (mic, send). */
export function FieldButton({
  icon,
  primary = false,
  state = "off",
  label,
  style,
  testID,
  accessibilityLabel,
  ...action
}: {
  icon: IconName;
  primary?: boolean;
  /**
   * MC-02: the microphone's state, rendered ON the button a person pressed.
   *
   * Before V-1 the only indicator was a bar at the far corner of the window,
   * so the control you pressed told you nothing about what it had done. The
   * button now carries it: `listening` pulses in the alert tone with the word
   * beside it, `transcribing` reads "Working…", `error` hands the honest line
   * to its caller to render under the field.
   *
   * `off` for every other button in the app, which is why it defaults.
   */
  state?: "off" | "requesting" | "listening" | "transcribing" | "done" | "error";
  /**
   * The word beside the glyph while `state` is live (MC-02).
   *
   * `null` as well as undefined, because `micStateLabel` returns null for the
   * states that carry no word — pushing that through `?? undefined` at every
   * call site would be three chances to write it differently.
   */
  label?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel: string;
} & ButtonAction) {
  const c = useTokens();
  const { disabled, ref, onPress } = useButtonChrome(action, testID ?? accessibilityLabel);
  // hard rule 20: a state a row adds takes a TOKEN. `micLive` is the pack's
  // own "a microphone is open" colour, already worn by `TalkBanner` and
  // `MicBanner` — so the button, the banner and the health line agree by
  // construction rather than by three people picking the same swatch.
  //
  // Not `alert`: alert means issues, over-budget and the lock (hard rule 20),
  // and a mic that is working is not an alarm.
  const live = state === "listening" || state === "requesting";
  const tint = live ? c.micLive : state === "transcribing" ? c.accentInk : primary ? c.accentInk : c.muted;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      testID={testID}
      onPress={onPress}
      // MC-02: the state reaches the DOM through `dataSet`, which is the only
      // way react-native-web emits a data-* attribute — a bare
      // `data-mic-state` prop is dropped on the floor. Same reason the
      // `field-io` marker is already routed through here (B-10: a
      // native-renderer test sees the prop and never the DOM).
      {...touchSlop(3, { "field-io": "1", "mic-state": state })}
      aria-live={live ? "polite" : undefined}
      style={[
        {
          // the word makes it wider than a 30px square while it is live
          minWidth: 30,
          paddingHorizontal: label != null && state !== "off" ? 8 : 0,
          height: 30,
          borderRadius: radius.control,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: label != null && state !== "off" ? 4 : 0,
          // S6-18: while live the fill is NOT Accent soft — that is the
          // selected chip's dress, worn 60px above by the focus chip, and it
          // made "Listening" read as a filter that was on. The Marker circle
          // below is the only saturated thing on the page, as the pack says.
          backgroundColor: !live && primary ? c.accentSoft : "transparent",
          borderWidth: primary || live ? 0 : 1,
          borderColor: c.hairline,
          opacity: disabled ? misc.disabledOpacity : 1,
        },
        style,
      ]}
    >
      {live ? (
        // the word beside it stays in ink: "never white text" on a saturated fill
        <Pulse size={LIVE_GLYPH} growth={LIVE_RING_GROWTH} color={c.micLive} data={{ "mic-live": "1" }}>
          <Icon name={icon} fill size={12} color={c.onSelected} />
        </Pulse>
      ) : (
        <Icon name={icon} size={16} color={tint} />
      )}
      {label != null && state !== "off" && (
        <Txt kind="meta" style={{ color: live ? c.ink : tint }} testID={testID != null ? `${testID}-state` : undefined}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}
