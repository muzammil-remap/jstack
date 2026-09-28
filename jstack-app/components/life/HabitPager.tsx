/**
 * HabitPager (LH1-05) — `‹ SEPTEMBER 2026 ›` as one group, at content width.
 *
 * It was a full-width `space-between` row, which at 1366 put the two arrows
 * 828px apart with the month label centred between them, and at 1920 the same
 * — the pack's standing rule against centred layouts on desktop, broken by a
 * control that had nothing to do with the width it was given.
 *
 * Shared by the month and year views because they page identically and a second
 * copy would drift; the only difference is the word in the middle.
 */
import React from "react";
import { View } from "react-native";
import { IconBtn, Txt } from "@/theme/ui";
import { space } from "@/theme/tokens";

export function HabitPager({
  testID,
  caption,
  onBack,
  onForward,
  backReason,
  forwardReason,
  backLabel,
  forwardLabel,
}: {
  /** `habit-month` or `habit-year`; the ids derive from it */
  testID: string;
  caption: string;
  onBack?: () => void;
  onForward?: () => void;
  /** why the arrow is disabled — never a dead control */
  backReason: string;
  forwardReason: string;
  backLabel: string;
  forwardLabel: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space[2] }}>
      <IconBtn
        icon="chevron_left"
        testID={`${testID}-prev`}
        accessibilityLabel={backLabel}
        {...(onBack != null ? { onPress: onBack } : { disabledReason: backReason })}
      />
      <Txt testID={`${testID}-caption`} kind="label">
        {caption}
      </Txt>
      <IconBtn
        icon="chevron_right"
        testID={`${testID}-next`}
        accessibilityLabel={forwardLabel}
        {...(onForward != null ? { onPress: onForward } : { disabledReason: forwardReason })}
      />
    </View>
  );
}
