/**
 * EaLayoutBanner (AR-06) — shown on a tab whose layout the EA last set
 * (`Layout.managedBy === "ea"`), with the reason and a one-tap revert back
 * to Josh's own arrangement. No mock reference for this one (V2-only,
 * AR-06 has no v1.2 predecessor) — copy invented to match the app's own
 * voice elsewhere (Issues/Checks rows use the same "reason line + one
 * action" shape).
 */
import React from "react";
import { View } from "react-native";
import { Btn, Txt } from "@/theme/ui";
import type { TabId } from "@/layout/tabRoutes";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { sayRefused } from "@/lib/optimistic";

export function EaLayoutBanner({ tab }: { tab: TabId }) {
  const c = useTokens();
  const layout = useSettingsStore((s) => s.layouts[tab]);
  const revertLayout = useSettingsStore((s) => s.revertLayout);
  const showToast = useSessionStore((s) => s.showToast);

  if (layout?.managedBy !== "ea") return null;

  return (
    <View
      testID="ea-layout-banner"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        backgroundColor: c.accentSoft,
        borderRadius: radius.card,
        padding: space[3],
        marginBottom: space[3],
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt kind="body">Your EA rearranged this tab</Txt>
        {layout.reason != null && <Txt kind="meta" style={{ marginTop: 2 }}>{layout.reason}</Txt>}
      </View>
      <Btn
        testID="ea-layout-revert"
        label="Revert"
        onPress={() => void revertLayout(tab).then(() => showToast("Reverted to your arrangement"), sayRefused)}
      />
    </View>
  );
}
