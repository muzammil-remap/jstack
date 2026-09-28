/**
 * Text primitives (S-2 split of theme/ui.tsx, ADR-33): `Txt` (SM-04's
 * general-purpose text role — a `kind` naming the size, a `tone` overriding
 * that kind's colour, an optional `weight`; the kind tables themselves live
 * in `./textKinds`, see that file for why) plus the
 * named roles that predate it (TextLink, Meta, Expiry, CardTitle, Stat;
 * Label moved to `./label` at P-7) — kept as their own components rather
 * than folded in, since three
 * of them (Label's uppercase+badge+hint layout, Expiry's own colour token,
 * TextLink's link semantics) carry structure `Txt`'s flat kind/tone pair
 * doesn't cover; where a role is a plain coloured/sized `<Text>`, it is now
 * `Txt` underneath so the two can never drift apart.
 */
import React from "react";
import { StyleProp, Text, TextStyle, ViewStyle } from "react-native";
import { touchSlop, webHitArea } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { fonts, type as typeScale } from "@/theme/tokens";
import { useTxtStyle, type TxtKind, type TxtTone, type TxtWeight } from "./textKinds";

// S-2b moved the kind tables to `./textKinds` (see that file's header for
// why). Re-exported here so `@/theme/ui/text` keeps the surface it had.
export { useTxtStyle };
export type { TxtKind, TxtTone, TxtWeight };

/**
 * The general-purpose text role (SM-04). `kind` sets size (and, for
 * `title`/`stat`, the heading family and weight); `tone` overrides the
 * kind's own default colour; `weight` overrides regular/emphasis on any
 * kind that doesn't already carry one baked in.
 *
 * `onPress` makes it a small text link (the "configure"/"schedules"/
 * "history" pattern repeated across the app: a `Txt` with an accent tone
 * that taps to open something) — the same `LINK_SLOP` hit-area treatment
 * `TextLink` applies is added automatically, so a call site never has to
 * remember it. Plain (no `onPress`) `Txt` stays a static, non-interactive
 * `<Text>`.
 */
export function Txt({
  kind = "body",
  tone,
  weight,
  children,
  style,
  testID,
  numberOfLines,
  onPress,
  accessibilityLabel,
}: {
  kind?: TxtKind;
  tone?: TxtTone;
  weight?: TxtWeight;
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  testID?: string;
  numberOfLines?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const txtStyle = useTxtStyle(kind, tone, weight);
  const linkProps =
    onPress != null
      ? { accessibilityRole: "link" as const, accessibilityLabel, onPress, ...touchSlop(LINK_SLOP) }
      : {};
  return (
    <Text testID={testID} numberOfLines={numberOfLines} {...linkProps} style={[txtStyle, onPress != null ? webHitArea(LINK_SLOP) : null, style]}>
      {children}
    </Text>
  );
}

/**
 * `<TextLink>` — the pack's text link (README Components: "Text link: Accent
 * ink, no underline, cursor pointer"), and the fix for AUDIT_v2.md A-02.
 *
 * Twenty-four controls were written as a bare `<Text onPress>`. React Native
 * Web renders that as a plain span with **no role, no accessible name and no
 * tabindex**, which meant three separate things at once: they were 13-14px
 * tall against GL-05's stated 36px floor, a screen reader announced them as
 * prose (QB-04), and they could not be reached by keyboard at all. The sweep
 * that proves GL-05 could not see any of them either — its selector matches
 * roles, and these had none — so the floor was enforced only over the controls
 * that already complied.
 *
 * `hitSlop` is the pack's own answer to a small target ("row verbs are 28px
 * tall but sit inside a 44px row that is also tappable"), and the sweep counts
 * it. 14 either side, not 12: the narrowest of these labels is "all" at 11px,
 * which 12 left at 35 — one pixel under the floor. `role="link"` gets the element a
 * tabindex from RNW, an announcement, and a place in the sweep's selector.
 */
export const LINK_SLOP = 14;

export function TextLink({
  label,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useTokens();
  return (
    <Text
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      {...touchSlop(LINK_SLOP)}
      style={[{ fontFamily: fonts.body, color: c.textLink, fontSize: typeScale.size.meta }, webHitArea(LINK_SLOP), style]}
    >
      {label}
    </Text>
  );
}

export function Meta({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  return (
    <Txt kind="meta" style={style} testID={testID}>
      {children}
    </Txt>
  );
}

export function Expiry({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  const c = useTokens();
  return (
    <Text testID={testID} style={[{ fontFamily: fonts.body, fontSize: typeScale.size.meta, color: c.textExpiry }, style]}>
      {children}
    </Text>
  );
}

export function CardTitle({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  return (
    <Txt kind="title" style={style} testID={testID}>
      {children}
    </Txt>
  );
}

export function Stat({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  return (
    <Txt kind="stat" style={style} testID={testID}>
      {children}
    </Txt>
  );
}

/** An inline emphasised span inside a `Txt` or a `Text` (F-62, P-7): the
 * weight cast three components wrote by hand, written once. */
export function Strong({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  return (
    <Text testID={testID} style={[{ fontWeight: String(typeScale.weight.emphasis) as TextStyle["fontWeight"] }, style]}>
      {children}
    </Text>
  );
}
