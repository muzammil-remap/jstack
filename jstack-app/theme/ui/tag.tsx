/**
 * `Tag` (F-36, P-7 — out of `chips.tsx`, which had reached SM-03's cap with
 * the skin as a nested ternary). One skin per tone in `TAG_SKIN`; a border on
 * EVERY tone (transparent unless alert), so the alert tag is the same height
 * as its neighbours (N1-07, P-9).
 */
import React from "react";
import { StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";
import { webData } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { fonts, radius, type as typeScale, type Tokens } from "@/theme/tokens";

/**
 * R-1 (RP-06) added `tone`. A capture's tags carry three DIFFERENT kinds of
 * fact and used to carry one colour, which made them read as one list: the
 * silo says who can see it, the content labels say what it is about, and the
 * sensitivity says how carefully to handle it. `alert` is the house's alert
 * treatment — border and ink, not a fill — because there is no `alertSoft`
 * token and EmergencyLock.tsx:99 already records that text on `c.alert`
 * measures 2.88:1 light / 2.55:1 dark, which is why nothing here fills with
 * it.
 */
export type TagTone = "accent" | "neutral" | "alert";

const TAG_SKIN: Record<TagTone, (c: Tokens) => { backgroundColor: string; ink: string; borderColor: string }> = {
  accent: (c) => ({ backgroundColor: c.accentSoft, ink: c.accentInk, borderColor: "transparent" }),
  neutral: (c) => ({ backgroundColor: c.surfaceInset, ink: c.muted, borderColor: "transparent" }),
  alert: (c) => ({ backgroundColor: "transparent", ink: c.alert, borderColor: c.alert }),
};

export function Tag({ label, style, testID, tone = "accent" }: { label: string; style?: StyleProp<ViewStyle>; testID?: string; tone?: TagTone }) {
  const c = useTokens();
  const skin = TAG_SKIN[tone](c);
  return (
    <View
      testID={testID}
      {...webData({ tag: "1", tagTone: tone })}
      style={[
        {
          alignSelf: "flex-start",
          paddingVertical: 2,
          paddingHorizontal: 5,
          borderRadius: radius.tag,
          backgroundColor: skin.backgroundColor,
          borderWidth: 1,
          borderColor: skin.borderColor,
        },
        style,
      ]}
    >
      {/* K1-08 (P-9): every tag at the pack's floor — README Type, "body never
          below 10.5px". The tag was the smallest text on every surface at
          9.5, and the alert tone alone sat at 10.5, which with its border made
          it 4 px taller than the row (N1-07). One size, one border, one
          height. The dark-scheme Alert-on-card contrast (3.73:1) needs the
          TOKEN and `theme/tokens.ts` is generated: carried, not silently left. */}
      <Text style={{ fontFamily: fonts.body, fontSize: 10.5, fontWeight: String(typeScale.weight.emphasis) as TextStyle["fontWeight"], color: skin.ink }}>{label}</Text>
    </View>
  );
}
