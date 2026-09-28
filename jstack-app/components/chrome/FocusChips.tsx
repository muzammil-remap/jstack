/**
 * `chipsRow()` (mock v11 line 548) — Everything · Personal · Family ·
 * Work + a `tune` button opening the focus editor (row 16 fills the real
 * dialog; row 6 ships the frame reading `GET /focuses`). On every tab
 * except Agents (FS-05); hidden app-wide when the App layout's focus-row
 * switch is off (row 17's Arrange).
 */
import React from "react";
import { View } from "react-native";
import { Chip, IconBtn } from "@/theme/ui";
import { useSettingsStore } from "@/stores/settings";
import { space } from "@/theme/tokens";

export function FocusChips({ onEdit }: { onEdit?: () => void }) {
  const focuses = useSettingsStore((s) => s.focuses);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const setActiveFocus = useSettingsStore((s) => s.setActiveFocus);

  if (focuses.length === 0) return null;

  return (
    <View testID="focus-chips" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginBottom: space[3], marginTop: -2 }}>
      {focuses.map((f) => (
        <Chip key={f.id} label={f.name} selected={f.id === activeFocus} onPress={() => setActiveFocus(f.id)} />
      ))}
      <IconBtn icon="tune" inCard accessibilityLabel="Edit focuses" onPress={onEdit ?? (() => {})} />
    </View>
  );
}
