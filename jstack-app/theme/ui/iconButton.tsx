/**
 * `IconBtn` (S-2b split of `theme/ui/controls.tsx`, ADR-33).
 *
 * Its own module because CD-17's hover state pushed `controls.tsx` past the
 * 250-line cap `tests/unit/sizes.test.ts` enforces, and an icon button is
 * the one control there that carries its own geometry (`sizes.iconBtn` /
 * `iconBtnCard`, GL-05's touch floor) rather than the shared label-button
 * shape. `theme/ui.tsx` re-exports it, so every existing import is
 * unchanged.
 */
import React from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { touchSlop } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { misc, radius, sizes, type as typeScale } from "@/theme/tokens";
import { Icon } from "@/components/chrome/Icon";
import type { IconName } from "@/components/chrome/icons.generated";
import { hoverSurface } from "./hover";
import { useButtonChrome, type ButtonAction } from "./controls";

/** `.js-iconbtn` (floating, on the ground) / `.in-card` (flat, inside a
 * card's own header row). */
export function IconBtn({
  icon,
  inCard = false,
  badge,
  strongGlyph = false,
  style,
  testID,
  accessibilityLabel,
  ...action
}: {
  icon: IconName;
  inCard?: boolean;
  /** draw the glyph in INK rather than Muted (ux round 2, B1-02).
   *
   * `more_horiz` at 18px is three ~2px dots, and a 2px dot is mostly
   * antialiased edge: it peaks at 2.04:1 against a card however dark you name
   * its colour, where `grid_view` on the same frame reaches Muted exactly.
   * Muted is right for a glyph that is a SECOND path beside a labelled verb.
   * It is not right where the glyph is the ONLY path — which is what the board
   * card's ⋮ is for a move without a drag. */
  strongGlyph?: boolean;
  /** a small count over the glyph (F-1, TF-04): how many filters are on behind
   * this button. The `accessibilityLabel` carries the same number — a badge is
   * a picture of a count, and a count nobody can hear is half a control. */
  badge?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel: string;
} & ButtonAction) {
  const c = useTokens();
  const { disabled, ref, hovered, hoverProps, onPress, disabledData } = useButtonChrome(action, testID ?? accessibilityLabel);
  const size = inCard ? sizes.iconBtnCard : sizes.iconBtn;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      testID={testID}
      onPress={onPress}
      {...hoverProps}
      {...touchSlop(4, { iconbtn: "1", ...disabledData })}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: inCard ? radius.control : radius.card,
          // CD-17
          backgroundColor: (!disabled && hovered ? hoverSurface(inCard ? "transparent" : c.card, c.card) : null) ?? (inCard ? "transparent" : c.card),
          borderWidth: 1,
          borderColor: inCard ? c.hairline : c.cardBorder,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? misc.disabledOpacity : pressed ? misc.pressedOpacity : 1,
          ...(inCard ? {} : c.shadow.native),
        },
        style,
      ]}
    >
      <Icon name={icon} size={inCard ? typeScale.icon.rail : typeScale.icon.header} color={strongGlyph ? c.ink : c.muted} />
      {badge != null && (
        <View
          testID={testID != null ? `${testID}-badge` : undefined}
          style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: c.accentInk, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: typeScale.size.small, lineHeight: 16, color: c.onSelected }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}
