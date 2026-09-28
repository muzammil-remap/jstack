/**
 * Portals — Agents' "Portals" card (AG-03/SEC-10): eight tiles, each
 * opening the shared outbound-link confirmation with the real domain —
 * nothing opens without it.
 */
import React from "react";
import { Pressable, View } from "react-native";
import { Card, Meta, Section, Txt } from "@/theme/ui";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useLayout } from "@/theme/useLayout";
import { space } from "@/theme/tokens";

export function Portals() {
  const { phone } = useLayout();
  const portals = useAgentsStore((s) => s.portals);
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <Section testID="agents-portals-section" sectionId="agents-portals" title={"Portals"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: 8 }}>
        {portals.map((p) => (
          <Pressable
            key={p.name}
            testID={`portal-${p.name}`}
            accessibilityRole="button"
            accessibilityLabel={p.name}
            onPress={() => openModal("external-link", packPayload(p.url, p.name))}
            style={{ flexBasis: phone ? "47%" : "23%", flexGrow: 1, minWidth: 80 }}
          >
            <Card style={{ alignItems: "center" }}>
              <Txt kind="body">{p.name}</Txt>
              <Meta>{p.purpose}</Meta>
            </Card>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}
