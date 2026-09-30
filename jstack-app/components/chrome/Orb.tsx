/**
 * `.js-mic` (design/tokens/components.css) — the floating mic, push-to-talk. Phone: right 20 / bottom 88, above the
 * tab bar and over the content — v2.3.2 WPR-1 gave back the band A6-07 reserved for it: the page's own bottom padding
 * (`ORB_CLEARANCE`) lets the last card scroll clear instead. Desktop: right 24 / bottom 24.
 *
 * WPR-2 (Josh, 16 Sep: "Confirm this is push to talk, and mic turns off when button released"): press-in opens a
 * Brain session through `lib/mic.ts`, release closes it and files what it heard through `POST /brain/dump` as voice
 * (`lib/pushToTalk.ts`); a tap too short to be a hold files nothing.
 *
 * WPR-1 (Josh: "subtle and semi transparent until pushed, where it becomes more prominent … the clickable ptt button
 * area slightly larger than the button image"): the drawn circle rests at 55 % with no shadow and, held, is opaque,
 * lifted and 6 % larger; the press target around it reaches `ORB_SLOP` further on every side — `hitSlop` on a phone,
 * a real padded box on the web, where react-native-web ignores `hitSlop` (`lib/webData.ts`).
 *
 * WPR-3: `OrbControl` is that drawn orb and its press target on their own, so the Dictate to EA sheet's microphone is
 * the same control at Talk's size (`components/brain/DictateDialog.tsx`), with the sheet's own press handlers.
 *
 * At-rest "breathing" (GL-06's mic pulse): a slow scale pulse on the wrapper that `prefers-reduced-motion` never
 * starts; `data-animating` mirrors which state is live so a test can assert on it directly.
 *
 * Hidden as before over any overlay, while another surface's microphone is open, and on a phone while a toast is up
 * (S6-09, S6-13, MC-10) — but never in the middle of its own hold, or the release would land on nothing and the
 * microphone stay open.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { useOverlayOpen } from "@/layout/dialogs";
import { useKeyboardBottom } from "@/lib/keyboard";
import { useBrainPushToTalk } from "@/lib/pushToTalk";
import { touchSlop, webData, webHitArea } from "@/lib/webData";
import { useAnyMicOpen } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useReducedMotion } from "@/theme/useReducedMotion";
import { useLayout } from "@/theme/useLayout";
import { sizes, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

// react-native-web has no native animation driver — requesting one only
// throws a console warning and falls back to JS anyway (GL-00's zero
// console budget caught this the moment the orb mounted on any page).
const NATIVE_DRIVER = Platform.OS !== "web";

/** WPR-1: how far beyond the drawn circle a press still lands, on every side */
const ORB_SLOP = 12;
/** WPR-1: the drawn circle at rest */
const REST_OPACITY = 0.55;
/** WPR-3: the Dictate to EA sheet's orb is Talk's size (`TalkScreen.tsx`'s `LiveMicOrb size={96}`) */
const LARGE_ORB = 96;

/**
 * WPR-1: how far up a phone screen the floating orb reaches — bottom 88, its circle, the slop its press takes beyond
 * the circle, and the step R2-02 gives every floating thing. The tab page's bottom PADDING, so the last card can
 * scroll clear of the orb; never a band the page ends above (that was A6-07's, and it is what Josh saw as "a band
 * across the screen wasting valuable screen space").
 */
export const ORB_CLEARANCE = 88 + sizes.mic + ORB_SLOP + space[3];

/**
 * WPR-1..3: the drawn orb and its press target. Faint at rest; opaque, lifted and 6 % larger while `holding`; a press
 * lands `ORB_SLOP` beyond the circle. The floating orb and the Dictate to EA sheet's microphone are this control at
 * two sizes, and each caller owns what a press does. `data` reaches the DOM as `data-*`, where the e2e board reads it.
 */
export function OrbControl({
  testID,
  size = "float",
  holding,
  accessibilityLabel,
  onPressIn,
  onPressOut,
  data,
}: {
  testID: string;
  size?: "float" | "large";
  holding: boolean;
  accessibilityLabel: string;
  onPressIn: () => void;
  onPressOut: () => void;
  data?: Record<string, string>;
}) {
  const c = useTokens();
  const px = size === "large" ? LARGE_ORB : sizes.mic;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      {...touchSlop(ORB_SLOP, data)}
      style={webHitArea(ORB_SLOP)}
    >
      <View
        testID={`${testID}-circle`}
        style={{
          width: px,
          height: px,
          borderRadius: px / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.cardBorder,
          opacity: holding ? 1 : REST_OPACITY,
          ...(holding ? { ...c.shadow.native, transform: [{ scale: 1.06 }] } : null),
        }}
      >
        <Icon name="mic" size={size === "large" ? 40 : 20} color={c.accentInk} />
      </View>
    </Pressable>
  );
}

export function Orb() {
  const { phone } = useLayout();
  const ptt = useBrainPushToTalk();
  // C-7b / MC-10: any purpose's open microphone makes the orb stand down — pressing it would steal that session
  const anyMicOpen = useAnyMicOpen();
  // S6-09: no capture control over a dialog's scrim; S6-13: on a phone the toast has this corner
  const overlayOpen = useOverlayOpen();
  const toastUp = useSessionStore((s) => s.toast != null);
  const showToast = useSessionStore((s) => s.showToast);
  // REMAP: voice is not in this build (`capabilities.liveVoice` off once settings load, as Talk says) — the orb says so
  const comingSoon = useSettingsStore((s) => s.loaded && !s.capabilities.liveVoice);
  const reducedMotion = useReducedMotion();
  // WPR-4 (b): while the keyboard is up the orb rides where the visual viewport ends, and stands down over the
  // expanded editor, which owns that band (UX-02), as the tab bar does
  const keyboardBottom = useKeyboardBottom();
  const editorExpanded = useUiStore((s) => s.editorExpanded);

  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // GL-06: the scale transform is the "pulse" reduced-motion drops —
    // simply never started when reduced, rather than started and undone.
    const scaleLoop = reducedMotion
      ? null
      : Animated.loop(
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.06, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
            Animated.timing(scale, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
          ]),
        );
    scaleLoop?.start();
    if (reducedMotion) scale.setValue(1);
    return () => {
      scaleLoop?.stop();
    };
  }, [reducedMotion, scale]);

  if (!ptt.holding && (anyMicOpen || overlayOpen || editorExpanded || (phone && toastUp))) return null;

  const animating = reducedMotion ? "off" : "on";

  return (
    <Animated.View
      {...webData({ animating })}
      pointerEvents="box-none"
      style={{ position: "absolute", right: phone ? 20 : 24, bottom: (phone ? 88 : 24) + keyboardBottom, transform: [{ scale }] }}
    >
      <OrbControl
        testID="mic-orb"
        holding={ptt.holding}
        accessibilityLabel={ptt.holding ? "Release to file" : "Hold to dictate"}
        onPressIn={comingSoon ? () => showToast("Coming soon") : ptt.pressIn}
        onPressOut={comingSoon ? () => undefined : ptt.pressOut}
        data={{ animating }}
      />
    </Animated.View>
  );
}
