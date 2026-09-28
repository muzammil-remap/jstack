/**
 * Focuses — Settings' "Focus filters" card (SE-07): rows with "edit"
 * (fixed focuses read "always present" instead); "Add a focus" opens
 * the editor (FS-04) — both route through `FocusEditDialog`.
 */
import React from "react";
import { View } from "react-native";
import { Btn, Label, ListCard, Meta, Row, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { space } from "@/theme/tokens";

export function Focuses() {
  const focuses = useSettingsStore((s) => s.focuses);
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <View testID="settings-focuses">
      <Label>Focus filters</Label>
      <ListCard style={{ marginTop: 8 }}>
        {focuses.map((f, i) => (
          <Row key={f.id} testID={`focus-row-${f.id}`} last={i === focuses.length - 1}>
            <Txt style={{ flex: 1 }}>{f.name}</Txt>
            {f.fixed ? (
              <Meta>always present</Meta>
            ) : (
              <Txt testID={`focus-edit-${f.id}`} onPress={() => openModal("focus-edit", f.id)} kind="meta" tone="accentInk">
                edit
              </Txt>
            )}
          </Row>
        ))}
      </ListCard>
      <Btn testID="focus-add" label="Add a focus" onPress={() => openModal("focus-edit", "new")} style={{ marginTop: space[2], alignSelf: "flex-start" }} />
    </View>
  );
}
