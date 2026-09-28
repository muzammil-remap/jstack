/**
 * BottomBanner (F-42, P-8) — the floating bar `MicBanner` and `TalkBanner`
 * both wore: an overlay on every tab, above the tab bar on a phone and along
 * the foot of the content on a desktop, the frosted bar surface. The two are
 * never up together (MicBanner does not render for a Talk microphone), so
 * they sit in the same place.
 *
 * S6-18 (ux round, Stage 6): it is the pack's BAR now — README Components,
 * "Bar (phone tab bar, listening bar): Bar colour, blur 24px, radius 10, same
 * shadow, inset 14px from the screen edges, height 60". It had been 34 tall
 * and inset 8, which was neither the pack's 360 × 60 corner bar nor a
 * deliberate new one. It stays FULL WIDTH on a desktop rather than the pack's
 * 360 bottom right, by Josh's own line — the corner bar is the one he did not
 * notice (JOSH_QA_v22 item 11; DISCREPANCIES 31). On a phone it takes the tab
 * bar's inset and sits `space[3]` above it at its content height: a second
 * 60px bar stacked on the first would be a fifth of the screen in chrome.
 *
 * `Z.screen`: under the gate (110) and the privacy shield (200) — a locked
 * screen must not carry a banner, because the lock ends the session.
 */
import React from "react";
import { View } from "react-native";
import { blur, misc, radius, space } from "@/theme/tokens";
import { frostedStyle } from "@/theme/ui";
import { useLayout } from "@/theme/useLayout";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";

/**
 * Where the bar sits and how tall it is. Phone: the tab bar's inset plus its
 * height plus one step. Desktop: the pack's inset.
 *
 * Module-local: the chrome that shares this band asks `bannerClearance` below
 * rather than doing the arithmetic itself, so there is one answer to "how much
 * room does the bar need" and not three (CT-06 caught these the moment the
 * last outside reader went through the function instead).
 */
const BANNER_BOTTOM = { phone: misc.barInset + misc.barHeight + space[3], desktop: misc.barInset } as const;
const BANNER_HEIGHT = { phone: 36, desktop: misc.barHeight } as const;

/**
 * The band a bottom banner occupies — its offset, its height and one step —
 * for the two things that must not run under it: the toast steps OVER it
 * (`Toast.tsx`), and the tab page ENDS above it (`TabScreen.tsx`).
 *
 * It lived privately in `Toast.tsx` until the A-4 audit found that only the
 * toast had ever asked: at 393 with the mic listening, the Brain page ran 118
 * px past the banner's top, which covered a Latest-in row's `open` and its
 * `edit` and swallowed a real tap on them (A4-03, B-176). One declaration,
 * because two would drift the moment the bar's height changed.
 *
 * A FUNCTION, not a module-level constant: `BottomBanner` is reached through
 * the `theme/ui` barrel (`controls.tsx` raises the disabled-reason toast), so
 * reading these exports while the bundle is still evaluating hit the live
 * binding before its `const` ran — "Cannot access 'p' before initialization"
 * on every page load, found by the first e2e on the change.
 */
export function bannerClearance(phone: boolean): number {
  return phone ? BANNER_BOTTOM.phone + BANNER_HEIGHT.phone + space[3] : BANNER_BOTTOM.desktop + BANNER_HEIGHT.desktop + space[3];
}

export function BottomBanner({ testID, children }: { testID: string; children: React.ReactNode }) {
  const c = useTokens();
  const { phone } = useLayout();
  return (
    <View
      testID={testID}
      style={{
        position: "absolute",
        left: misc.barInset,
        right: misc.barInset,
        bottom: phone ? BANNER_BOTTOM.phone : BANNER_BOTTOM.desktop,
        // a floor rather than a height on the phone: car mode's 64px End
        // (TS-06) grows the bar rather than spilling its hit area onto the
        // tab bar below it; the desktop bar IS the pack's 60
        ...(phone ? { minHeight: BANNER_HEIGHT.phone } : { height: BANNER_HEIGHT.desktop }),
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        paddingHorizontal: space[7],
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: c.cardBorder,
        backgroundColor: c.bar,
        ...frostedStyle(blur.bar),
        ...c.shadow.native,
        zIndex: Z.screen,
      }}
    >
      {children}
    </View>
  );
}
