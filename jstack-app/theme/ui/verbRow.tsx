/**
 * DialogVerbs — one verb row for every dialog (Josh's A-0 row 2, B3R2-08).
 *
 * Three dialogs put their verbs in three grammars: Emergency lock had the
 * primary first and wider, Configure had it first and 2.6× narrower, Arrange
 * had it last. "A person cannot learn where the affirmative button is, or
 * what it looks like." The pack states the intent on the decision card
 * (primary first, `flex 1.3`); this applies one rule to the dialogs:
 * **primary first, at least the secondary's width.** The secondary reports
 * its width through `onLayout` and the primary takes it as a floor, so a
 * short verb ("Save", "Done") never sits beside a long one ("Revert to the
 * EA's") looking like the lesser button.
 */
import React, { useState } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { space } from "@/theme/tokens";

export function DialogVerbs({ primary, secondary, style }: { primary: React.ReactNode; secondary: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [floor, setFloor] = useState<number | undefined>(undefined);
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }, style]}>
      <View testID="dialog-verbs-primary" style={floor != null ? { minWidth: floor } : undefined}>
        {primary}
      </View>
      <View testID="dialog-verbs-secondary" onLayout={(e) => setFloor((f) => Math.max(f ?? 0, Math.round(e.nativeEvent.layout.width)))}>
        {secondary}
      </View>
    </View>
  );
}
