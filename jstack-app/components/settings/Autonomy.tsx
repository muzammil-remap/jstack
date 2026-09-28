/**
 * Autonomy — Settings' "Autonomy" card (SE-05): six card types, each a
 * three-way Ask me / Propose / Auto segmented control persisted via
 * `PUT /settings/autonomy`.
 */
import React from "react";
import { View } from "react-native";
import { Card, Label, Seg, Txt } from "@/theme/ui";
import { useSettingsStore } from "@/stores/settings";
import { useSessionStore } from "@/stores/session";
import type { AutonomyLevel } from "@/data/types";

const OPTIONS: { key: AutonomyLevel; label: string }[] = [
  { key: "ask", label: "Ask me" },
  { key: "propose", label: "Propose" },
  { key: "auto", label: "Auto" },
];

export function Autonomy() {
  const autonomy = useSettingsStore((s) => s.autonomy);
  const putAutonomy = useSettingsStore((s) => s.putAutonomy);
  const showToast = useSessionStore((s) => s.showToast);

  const set = (cardType: string, level: AutonomyLevel) => {
    // a refused save (A4R6-11) has said why, and is not "saved"
    void putAutonomy({ ...autonomy, [cardType]: level }).then((saved) => saved && showToast("Autonomy saved · enforced server-side"));
  };

  return (
    <View testID="settings-autonomy">
      <Label>Autonomy</Label>
      <Card style={{ marginTop: 8, gap: 10 }}>
        {Object.keys(autonomy).map((cardType) => (
          <View key={cardType} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Txt style={{ flex: 1 }}>{cardType}</Txt>
            <Seg
              testID={`autonomy-${cardType.toLowerCase().replace(/\s+/g, "-")}`}
              options={OPTIONS}
              value={autonomy[cardType]}
              onChange={(v) => set(cardType, v)}
              width={200}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
