/**
 * Surface primitives (S-2 split of theme/ui.tsx, ADR-33): Card, ListCard,
 * Inset, Ghost, and the frosted-blur helper they share.
 */
import React from "react";
import { Platform, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { webData } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { hoverSurface, useHover } from "./hover";
import { blur, fonts, radius, type as typeScale } from "@/theme/tokens";

/** DS-05's "frosted" surfaces (`backdrop-filter: blur(Npx)`, design/tokens/
 * components.css `.js-card`/`.js-bar`) — web-only (RN has no backdrop
 * filter; native surfaces rely on their own opacity alone, same as
 * Sens.tsx's blur). `blur` was imported here since row 3 but never
 * actually applied to a style object until DS-05's own test found it. */
export function frostedStyle(px: number): ViewStyle {
  return Platform.OS === "web" ? ({ backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` } as unknown as ViewStyle) : {};
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: {
  children: React.ReactNode;
  /** CD-17: a card that is itself a tap target takes the pack's hover
   * state. A card with no `onPress` stays a plain `View` and has none —
   * hover is a pointer affordance, and a surface you cannot act on has
   * nothing to afford. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useTokens();
  const { hovered, hoverProps } = useHover();
  const isHovered = onPress != null && hovered;
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...(onPress ? hoverProps : {})}
      {...webData({ card: "1" })}
      style={[
        {
          backgroundColor: (isHovered ? hoverSurface(c.card, c.card) : null) ?? c.card,
          borderWidth: 1,
          borderColor: c.cardBorder,
          borderRadius: radius.card,
          padding: 12,
          ...frostedStyle(blur.card),
          ...c.shadow.native,
        },
        style,
      ]}
    >
      {children}
    </Wrapper>
  );
}

/** `.js-card.is-list` — a card holding a list of <Row>s: tight vertical
 * padding, the rows themselves carry the horizontal padding. */
export function ListCard({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useTokens();
  return (
    <View
      testID={testID}
      {...webData({ card: "1", list: "1" })}
      style={[
        {
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.cardBorder,
          borderRadius: radius.card,
          paddingVertical: 2,
          paddingHorizontal: 12,
          ...frostedStyle(blur.card),
          ...c.shadow.native,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Inset({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useTokens();
  return (
    <View testID={testID} style={[{ backgroundColor: c.surfaceInset, borderRadius: radius.control, padding: 9 }, style]}>
      {children}
    </View>
  );
}

export function Ghost({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useTokens();
  return (
    <View testID={testID} style={[{ borderWidth: 1, borderStyle: "dashed", borderColor: c.hairline, borderRadius: radius.card, padding: 12 }, style]}>
      {typeof children === "string" ? <Text style={{ fontFamily: fonts.body, color: c.muted, fontSize: typeScale.size.body }}>{children}</Text> : children}
    </View>
  );
}
