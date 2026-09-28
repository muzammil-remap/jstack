/**
 * The real tabs shell (row 6, ADR-01, ADR-07): Rail (≥768) or TabBar
 * (<768), the mic Orb, and `MicBanner` while a microphone is open. V-1
 * removed `ListeningBar`: on a phone it replaced the tab bar, so the thing
 * saying the mic was live took away the way out (ADR-49).
 * Routing is expo-router's own Stack per screen; `active`/`onTab` mirror
 * the router's segment so Rail/TabBar stay presentational.
 */
import { Slot, usePathname, useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { MicBanner } from "@/components/chrome/MicBanner";
import { Orb } from "@/components/chrome/Orb";
import { Rail } from "@/components/chrome/Rail";
import { TabBar } from "@/components/chrome/TabBar";
import { tabForPath, tabPath, type TabId } from "@/layout/tabRoutes";
import { useShell } from "@/layout/dialogs";
import { useSessionStore } from "@/stores/session";
import { selectHiddenTabs, useSettingsStore } from "@/stores/settings";
import { useLayout } from "@/theme/useLayout";
import { useTokens } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const c = useTokens();
  const { phone, rail } = useLayout();
  const router = useRouter();
  const pathname = usePathname();
  const openSettings = useSessionStore((s) => s.openSettings);
  const hiddenTabs = useSettingsStore(selectHiddenTabs);
  // S-3: a `screen`-kind dialog replaces the rail and tab bar while open
  const { onScreen, openFind } = useShell();

  // app/+not-found.tsx already handles a path this layout can't match (LK-03,
  // SEC-11) — no redirect needed here, just a safe fallback for `active`.
  const active = tabForPath(pathname) ?? "today";
  const onTab = (id: TabId) => router.navigate(tabPath(id));

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.ground }}>
      {rail && !onScreen && <Rail active={active} onTab={onTab} onFind={openFind} onSettings={() => openSettings()} hiddenTabs={hiddenTabs} />}
      <View style={{ flex: 1, position: "relative" }}>
        <Slot />
        {/* MC-01: two live mic affordances would be two owners — the orb stands down for any open microphone
            itself, except its own push-to-talk hold (WPR-2), which must stay under the finger until released */}
        <Orb />
        <MicBanner />
        {phone && !onScreen && <TabBar active={active} onTab={onTab} hiddenTabs={hiddenTabs} />}
      </View>
    </View>
  );
}
